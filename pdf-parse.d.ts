declare module "pdf-parse/lib/pdf-parse.js" {
  const pdfParse: (dataBuffer: Buffer | Uint8Array, options?: any) => Promise<{ text: string; [key: string]: any }>;
  export default pdfParse;
}
