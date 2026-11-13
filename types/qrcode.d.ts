// qrcode ships no types, and the app uses only this one call. A local declaration keeps the
// dependency list to the package itself.
declare module "qrcode" {
  export interface QRCodeModules {
    size: number;
    get(row: number, col: number): number;
  }
  export function create(text: string, options?: { errorCorrectionLevel?: "L" | "M" | "Q" | "H" }): { modules: QRCodeModules };
}
