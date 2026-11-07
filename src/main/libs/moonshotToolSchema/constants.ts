export const JsonSchemaKeyword = {
  Ref: '$ref',
  Type: 'type',
  Defs: '$defs',
  Definitions: 'definitions',
  Properties: 'properties',
  PatternProperties: 'patternProperties',
  DependentSchemas: 'dependentSchemas',
  Dependencies: 'dependencies',
  Items: 'items',
  PrefixItems: 'prefixItems',
  AdditionalItems: 'additionalItems',
  AdditionalProperties: 'additionalProperties',
  UnevaluatedItems: 'unevaluatedItems',
  UnevaluatedProperties: 'unevaluatedProperties',
  Contains: 'contains',
  PropertyNames: 'propertyNames',
  ContentSchema: 'contentSchema',
  Not: 'not',
  If: 'if',
  Then: 'then',
  Else: 'else',
  AllOf: 'allOf',
  AnyOf: 'anyOf',
  OneOf: 'oneOf',
  Const: 'const',
  Enum: 'enum',
} as const;

export const JsonSchemaAnnotation = {
  Title: 'title',
  Description: 'description',
  Default: 'default',
  Examples: 'examples',
  Comment: '$comment',
} as const;

export const MoonshotApiHost = {
  MoonshotChina: 'api.moonshot.cn',
  MoonshotGlobal: 'api.moonshot.ai',
  KimiChina: 'api.kimi.com',
  KimiGlobal: 'api.kimi.ai',
} as const;

export const ToolSchemaField = {
  Parameters: 'parameters',
} as const;

export const OpenAIFunctionTool = {
  Type: 'function',
  AutoChoice: 'auto',
} as const;

export const MoonshotSchemaError = {
  InvalidSchema: 'not a valid moonshot flavored json schema',
  MaximumSize: 'schema exceeds maximum allowed size',
} as const;

export const JsonSchemaType = {
  Object: 'object',
  Array: 'array',
  Integer: 'integer',
  String: 'string',
  Null: 'null',
} as const;
