const db = require("@saltcorn/data/db");
const Form = require("@saltcorn/data/models/form");
const Workflow = require("@saltcorn/data/models/workflow");
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
            ],
          });
        },
      },
    ],
  });

const get_state_fields = () => [];

const run = async (table_id, viewname, { sql }, state, extraArgs) => {
  const qres = await db.query(sql);
  //console.log(qres);
  return mkTable(
    qres.fields.map((field) => ({ label: field.name, key: field.name })),
    qres.rows
  );
};

module.exports = {
  sc_plugin_api_version: 1,
  plugin_name: "sql-list",
  viewtemplates: [
    {
      name: "ListSQL",
      display_state_form: false,
      get_state_fields,
      tableless: true,
      configuration_workflow,
      run,
    },
  ],
};
