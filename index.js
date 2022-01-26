const db = require("@saltcorn/data/db");
const Form = require("@saltcorn/data/models/form");
const Field = require("@saltcorn/data/models/field");
const FieldRepeat = require("@saltcorn/data/models/fieldrepeat");
const Workflow = require("@saltcorn/data/models/workflow");
const { eval_expression } = require("@saltcorn/data/models/expression");
const {
  text,
  div,
  h5,
  style,
  a,
  script,
  pre,
  domReady,
  i,
  text_attr,
} = require("@saltcorn/markup/tags");
const { mkTable } = require("@saltcorn/markup");

const { Parser } = require("node-sql-parser");
const parser = new Parser();

const configuration_workflow = () =>
  new Workflow({
    steps: [
      {
        name: "views",
        form: async (context) => {
          return new Form({
            fields: [
              {
                name: "sql",
                label: "SQL",
                input_type: "code",
                attributes: { mode: "text/x-sql" },
              },
              {
                name: "skip_cfg_fields",
                label: "Skip configured fields",
                type: "Bool",
                sublabel:
                  "Show the raw columns from the query instead of the columns defined below",
              },
              new FieldRepeat({
                name: "columns",
                fields: [
                  {
                    name: "type",
                    label: "Type",
                    type: "String",
                    required: true,
                    attributes: {
                      //TODO omit when no options
                      options: ["Query column", "Link formula"],
                    },
                  },
                  {
                    name: "query_name",
                    label: "Column name",
                    sublabel: "This should match the column name exactly",
                    type: "String",
                    showIf: { type: "Query column" },
                  },
                  {
                    name: "query_transform",
                    label: "Transform",
                    type: "String",
                    attributes: { options: ["JSON stringify"] },
                    showIf: { type: "Query column" },
                  },
                  {
                    name: "link_text",
                    label: "Link text formula",
                    type: "String",
                    required: true,
                    showIf: { type: "Link formula" },
                  },
                  {
                    name: "link_url",
                    label: "Link URL formula",
                    type: "String",
                    required: true,
                    showIf: { type: "Link formula" },
                  },
                  {
                    name: "header_label",
                    label: "Header label",
                    type: "String",
                  },
                ],
              }),
            ],
          });
        },
      },
    ],
  });

const get_state_fields = () => [];

const do_transform = (xform, nm) =>
  xform === "JSON stringify" ? (r) => JSON.stringify(r[nm]) : nm;

const run = async (
  table_id,
  viewname,
  { sql, skip_cfg_fields, columns },
  state,
  extraArgs
) => {
  const table = await Table.findOne(
    typeof table_id === "string" ? { name: table_id } : { id: table_id }
  );
  const fields = await table.getFields();
  readState(state, fields, extraArgs.req);

  const is_sqlite = db.isSQLite;

  const { tableList, columnList, ast } = parser.parse(sql, {
    database: "PostgreSQL",
  });
  console.log(ast);
  console.log(tableList);
  for (tableAccess of tableList) {
    const [stmt, schema, tbl] = tableAccess.split("::");
    if (schema !== "null")
      throw new Error("SQL statement cannot access a different schema");
  }
  const client = is_sqlite ? db : await db.getClient();
  await client.query(`BEGIN;`);
  await client.query(`SET LOCAL search_path TO "${db.getTenantSchema()}";`);
  await client.query(`SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;`);

  const qres = await client.query(sql);
  await client.query(`ROLLBACK`);

  if (!is_sqlite) client.release(true);

  //console.log(qres);
  const tfields = skip_cfg_fields
    ? qres.fields.map((field) => ({ label: field.name, key: field.name }))
    : columns.map((col) =>
        col.type === "Query column"
          ? {
              label: col.header_label || col.query_name,
              key: col.query_transform
                ? do_transform(col.query_transform, col.query_name)
                : col.query_name,
            }
          : {
              label: col.header_label,
              key(r) {
                let txt, href;
                try {
                  txt = eval_expression(col.link_text, r);
                } catch (error) {
                  error.message = `Error in formula ${col.link_text} for link text:\n${error.message}`;
                  throw error;
                }
                try {
                  href = eval_expression(col.link_url, r);
                } catch (error) {
                  error.message = `Error in formula ${col.link_url} for link URL:\n${error.message}`;
                  throw error;
                }

                return a({ href }, txt);
              },
            }
      );
  return mkTable(tfields, qres.rows);
};

module.exports = {
  sc_plugin_api_version: 1,
  plugin_name: "sql-list",
  viewtemplates: [
    {
      name: "ListSQL",
      display_state_form: false,
      get_state_fields,
      configuration_workflow,
      run,
    },
  ],
};
