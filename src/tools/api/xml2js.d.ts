// Type definitions for xml2js
declare module 'xml2js' {
  export function parseStringPromise(
    xml: string,
    options?: any
  ): Promise<any>;
}
