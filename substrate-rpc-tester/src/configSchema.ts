import Ajv from "ajv/dist/jtd.js";

const ajv = new Ajv.default({ allErrors: true });

const configSchema = {
  properties: {
    endPoint: { type: "string" },
    keyring: {
      properties: {
        type: { enum: ["sr25519", "ed25519", "ecdsa"] },
        ss58Format: { type: "uint32" },
      },
    },
    connections: { type: "uint16" },
    txs: {
      // it required discriminated union. So txs is not checking
      // ref: https://ajv.js.org/json-type-definition.html#empty-form
      elements: {},
    },
  },
  optionalProperties: {
    writeTxWait: {
      enum: ["none", "inblock", "finalized"],
    },
    development: { type: "boolean" },
    signers: {
      values: { type: "string" },
    },
  },
};

const validate = ajv.compile(configSchema);

export default validate;
export { configSchema };
