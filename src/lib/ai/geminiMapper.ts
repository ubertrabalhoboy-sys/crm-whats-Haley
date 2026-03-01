import { FunctionDeclaration, SchemaType } from "@google/generative-ai";

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
function mapSchema(schema: any): any {
    if (!schema) return undefined;

    const res: any = {
        type: mapType(schema.type),
        description: schema.description,
    };

    // CORREÇÃO: Informa ao Gemini que o campo pode ser Null (Essencial para cupom_code e change_for)
    if (Array.isArray(schema.type) && schema.type.includes("null")) {
        res.nullable = true;
    }

    if (schema.enum) {
        res.enum = schema.enum;
    }

    if (schema.properties) {
        res.properties = {};
        for (const key in schema.properties) {
            res.properties[key] = mapSchema(schema.properties[key]);
        }
    }

    if (schema.items) {
        res.items = mapSchema(schema.items);
    }

    if (schema.required && Array.isArray(schema.required)) {
        res.required = schema.required;
    }

    return res;
}

/**
 * Converts an array of OpenAI-formatted tool definitions from tools.json
 * into Gemini FunctionDeclarations.
 */
export function mapOpenAIToolsToGemini(openaiTools: any[]): FunctionDeclaration[] {
    return openaiTools.map(t => {
        const fn = t.function;

        const result: FunctionDeclaration = {
            name: fn.name,
            description: fn.description,
        };

        if (fn.parameters && Object.keys(fn.parameters).length > 0) {
            result.parameters = mapSchema(fn.parameters);
        }

        return result;
    });
}