function toAscii(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\x20-\x7E]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function escapePdfText(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * Gera um PDF simples de uma pagina com texto.
 * Mantido sem dependencia externa para rodar em qualquer ambiente Node.
 */
export function buildSimplePdf(lines: string[]): Uint8Array {
    const safeLines = lines
        .map((line) => toAscii(line))
        .filter((line) => line.length > 0)
        .slice(0, 44);

    if (safeLines.length === 0) {
        safeLines.push("Relatorio sem dados.");
    }

    const textOps: string[] = ["BT", "/F1 11 Tf", "50 790 Td"];
    safeLines.forEach((line, index) => {
        const escaped = escapePdfText(line);
        if (index > 0) {
            textOps.push("0 -16 Td");
        }
        textOps.push(`(${escaped}) Tj`);
    });
    textOps.push("ET");
    const stream = textOps.join("\n");

    const objects = [
        "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
        `4 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream\nendobj\n`,
        "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    ];

    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [0];

    for (const obj of objects) {
        offsets.push(Buffer.byteLength(pdf, "utf8"));
        pdf += obj;
    }

    const xrefOffset = Buffer.byteLength(pdf, "utf8");
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += "0000000000 65535 f \n";
    for (const offset of offsets.slice(1)) {
        pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    }

    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
    pdf += `startxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(pdf, "utf8");
}
