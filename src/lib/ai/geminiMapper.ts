import {
    FunctionDeclaration,
    FunctionDeclarationSchema,
    Schema,
    SchemaType,
} from "@google/generative-ai";

type JsonSchemaNode = {
    type?: string | string[];
    description?: string;
    enum?: string[];
    properties?: Record<string, JsonSchemaNode>;
    items?: JsonSchemaNode;
    required?: string[];
    minItems?: number;
    maxItems?: number;
    format?: string;
};

type OpenAIToolDefinition = {
    function: {
        name: string;
        description: string;
        parameters?: JsonSchemaNode;
    };
};

/**
 * Maps an OpenAPI/JSON Schema type to Google Generative AI SchemaType.
 */
function mapType(typeStr: string | string[]): SchemaType {
    // Pega o tipo principal ignorando o 'null' provisoriamente
    if (Array.isArray(typeStr)) {
        typeStr = typeStr.find(t => t !== "null") || "string";
    }

    switch (typeStr) {
        case "string": return SchemaType.STRING;
        case "number": return SchemaType.NUMBER;
        case "integer": return SchemaType.INTEGER;
        case "boolean": return SchemaType.BOOLEAN;
        case "array": return SchemaType.ARRAY;
        case "object": return SchemaType.OBJECT;
        default: return SchemaType.STRING;
    }
}

/**
 * Recursively maps an OpenAPI JSON parameter schema to the Gemini Schema structure.
 */
function mapSchema(schema: JsonSchemaNode | undefined): Schema | undefined {
    if (!schema) return undefined;

    const res: Record<string, unknown> = {
        type: mapType(schema.type || "string"),
        description: schema.description,
    };

    // CORREÇÃO: Informa ao Gemini que o campo pode ser Null (Essencial para cupom_code e change_for)
    if (Array.isArray(schema.type) && schema.type.includes("null")) {
        res.nullable = true;
    }

    if (schema.enum?.length) {
        res.format = "enum";
        res.enum = schema.enum;
    }

    if (schema.properties) {
        const properties: Record<string, Schema> = {};
        for (const key in schema.properties) {
            const mappedProperty = mapSchema(schema.properties[key]);
            if (mappedProperty) {
                properties[key] = mappedProperty;
            }
        }
        res.properties = properties;
    }

    if (schema.items) {
        res.items = mapSchema(schema.items);
    }

    if (typeof schema.minItems === "number") {
        res.minItems = schema.minItems;
    }

    if (typeof schema.maxItems === "number") {
        res.maxItems = schema.maxItems;
    }

    if (!schema.enum && schema.format === "date-time") {
        res.format = "date-time";
    } else if (!schema.enum && schema.type === "integer" && (schema.format === "int32" || schema.format === "int64")) {
        res.format = schema.format;
    } else if (!schema.enum && schema.type === "number" && (schema.format === "float" || schema.format === "double")) {
        res.format = schema.format;
    }

    if (schema.required && Array.isArray(schema.required)) {
        res.required = schema.required;
    }

    return res as unknown as Schema;
}

function mapFunctionParameters(schema: JsonSchemaNode): FunctionDeclarationSchema {
    const mappedSchema = mapSchema(schema);
    const properties =
        mappedSchema && "properties" in mappedSchema && mappedSchema.properties
            ? mappedSchema.properties
            : {};

    return {
        type: SchemaType.OBJECT,
        description: schema.description,
        properties,
        required: Array.isArray(schema.required) ? schema.required : undefined,
    };
}

/**
 * Converts an array of OpenAI-formatted tool definitions from tools.json
 * into Gemini FunctionDeclarations.
 */
export function mapOpenAIToolsToGemini(openaiTools: OpenAIToolDefinition[]): FunctionDeclaration[] {
    return openaiTools.map(t => {
        const fn = t.function;

        const result: FunctionDeclaration = {
            name: fn.name,
            description: fn.description,
        };

        if (fn.parameters && Object.keys(fn.parameters).length > 0) {
            result.parameters = mapFunctionParameters(fn.parameters);
        }

        return result;
    });
}
