import { rpcClient } from '@cryptobingo/blockchain-core';

const ATOMIC_ACCOUNT = process.env.ATOMICASSETS_ACCOUNT || 'atomicassets';
const CONTRACT_ACCOUNT = process.env.CONTRACT_ACCOUNT || 'bingogamectr';

interface SchemaField {
    name: string;
    type: number;
}

interface SchemaFormat {
    id: number;
    asset_creator: string;
    collection_name: string;
    schema_name: string;
    format: SchemaField[];
}

interface TemplateRow {
    template_id: string;
    schema_name: string;
    collection_name: string;
    immutable_serialized_data: string;
}

const ATOMIC_TYPE_SIZE: Record<number, number> = {
    0: 0,
    1: 1, 2: 1, 3: 2, 4: 2, 5: 4, 6: 8,
    7: 4, 8: 8, 9: 4, 10: 8, 11: 8,
    12: 16, 13: 4, 14: 8, 15: 4, 16: 8,
    17: 0, 18: 1, 19: 1, 20: 0, 21: 0,
};

const ATOMIC_TYPE_INT = 1;
const ATOMIC_TYPE_UINT8 = 2;
const ATOMIC_TYPE_UINT16 = 3;
const ATOMIC_TYPE_UINT32 = 4;
const ATOMIC_TYPE_UINT64 = 5;
const ATOMIC_TYPE_INT8 = 7;
const ATOMIC_TYPE_INT16 = 8;
const ATOMIC_TYPE_INT32 = 9;
const ATOMIC_TYPE_INT64 = 10;

function hexToBytes(hex: string): Uint8Array {
    const s = hex.startsWith('0x') ? hex.slice(2) : hex;
    const bytes = new Uint8Array(s.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(s.substr(i * 2, 2), 16);
    }
    return bytes;
}

function readInt(bytes: Uint8Array, offset: number, signed: boolean, size: number): number {
    let val = 0;
    for (let i = 0; i < size; i++) {
        val |= bytes[offset + i] << (i * 8);
    }
    if (signed && size === 1) val = (val << 24) >> 24;
    if (signed && size === 2) val = (val << 16) >> 16;
    if (signed && size === 4) val = (val | 0);
    return val >>> 0;
}

function readName(bytes: Uint8Array, offset: number): string {
    let value = 0n;
    for (let i = 0; i < 8; i++) {
        value |= BigInt(bytes[offset + i]) << BigInt(i * 8);
    }
    const charmap = '.12345abcdefghijklmnopqrstuvwxyz';
    const result: string[] = [];
    for (let i = 0; i < 13; i++) {
        const idx = Number((value >> BigInt(64 - 5 * (i + 1))) & 0x1fn);
        if (idx === 0) break;
        result.push(charmap[idx]);
    }
    return result.join('') || '.';
}

function deserializeField(bytes: Uint8Array, offset: number, type: number): { value: any; bytesRead: number } {
    switch (type) {
        case 0: return { value: null, bytesRead: 0 };
        case 1: return { value: `${bytes[offset]}`, bytesRead: 1 };
        case 2: return { value: bytes[offset] >>> 0, bytesRead: 1 };
        case 3: return { value: readInt(bytes, offset, false, 2), bytesRead: 2 };
        case 4: return { value: readInt(bytes, offset, false, 4), bytesRead: 4 };
        case 5: {
            const v = readInt(bytes, offset, false, 8);
            return { value: v.toString(), bytesRead: 8 };
        }
        case 6: return { value: readInt(bytes, offset, true, 1), bytesRead: 1 };
        case 7: return { value: readInt(bytes, offset, true, 1), bytesRead: 1 };
        case 8: return { value: readInt(bytes, offset, true, 2), bytesRead: 2 };
        case 9: return { value: readInt(bytes, offset, true, 4), bytesRead: 4 };
        case 10: return { value: readInt(bytes, offset, true, 8), bytesRead: 8 };
        case 11: return { value: readName(bytes, offset), bytesRead: 8 };
        case 12: return { value: hexToBytes(bytes.slice(offset, offset + 16).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '')), bytesRead: 16 };
        case 13: { const v = new Float32Array(bytes.buffer.slice(offset, offset + 4))[0]; return { value: v, bytesRead: 4 }; }
        case 14: { const v = new Float64Array(bytes.buffer.slice(offset, offset + 8))[0]; return { value: v, bytesRead: 8 }; }
        case 15: return { value: readInt(bytes, offset, false, 4), bytesRead: 4 };
        case 16: return { value: readInt(bytes, offset, false, 8), bytesRead: 8 };
        case 17: {
            const len = readInt(bytes, offset, false, 2);
            const raw = bytes.slice(offset + 2, offset + 2 + len);
            return { value: new TextDecoder().decode(raw), bytesRead: 2 + len };
        }
        case 18: return { value: bytes[offset] !== 0, bytesRead: 1 };
        case 19: return { value: bytes[offset] !== 0, bytesRead: 1 };
        default: return { value: null, bytesRead: 0 };
    }
}

function deserializeAttributes(bytes: Uint8Array, format: SchemaField[]): Record<string, any> {
    const result: Record<string, any> = {};
    let offset = 0;
    for (const field of format) {
        const type = field.type;
        const size = ATOMIC_TYPE_SIZE[type] ?? 0;
        if (size === 0 && type !== 17) continue;
        const { value, bytesRead } = deserializeField(bytes, offset, type);
        result[field.name] = value;
        offset += bytesRead;
    }
    return result;
}

export async function getTemplateSchema(collectionName: string, templateId: string | number): Promise<Record<string, any>> {
    const schemasRes = await rpcClient.v1.chain.get_table_rows({
        code: ATOMIC_ACCOUNT, scope: collectionName, table: 'schemas',
        limit: 100, json: true,
    });
    const templatesRes = await rpcClient.v1.chain.get_table_rows({
        code: ATOMIC_ACCOUNT, scope: collectionName, table: 'templates',
        lower_bound: templateId as any, upper_bound: templateId as any,
        limit: 1, json: true,
    });
    const template = (templatesRes.rows as TemplateRow[])?.[0];
    if (!template) return {};
    const schema = (schemasRes.rows as any[])?.find((s: any) => s.schema_name === template.schema_name);
    if (!schema) return {};
    const format = (schema.format ?? []) as SchemaField[];
    const raw = template.immutable_serialized_data || '';
    if (!raw) return {};
    const bytes = hexToBytes(raw);
    return deserializeAttributes(bytes, format);
}

export async function getRarity(collectionName: string, templateId: string | number): Promise<number> {
    try {
        const attrs = await getTemplateSchema(collectionName, templateId);
        const rarity = attrs['rarity'] ?? attrs['raridade'] ?? attrs['r'] ?? 1;
        const num = typeof rarity === 'string' ? parseInt(rarity, 10) : Number(rarity);
        return isNaN(num) || num < 1 ? 1 : Math.min(num, 10);
    } catch {
        return 1;
    }
}
