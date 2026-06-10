declare module 'jsbarcode' {
  interface JsBarcodeOptions {
    format?: string;
    width?: number;
    height?: number;
    fontSize?: number;
    margin?: number;
    displayValue?: boolean;
    [key: string]: unknown;
  }
  function JsBarcode(
    element: Element | string,
    value: string,
    options?: JsBarcodeOptions
  ): void;
  export default JsBarcode;
}
