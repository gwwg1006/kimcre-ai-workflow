declare module 'occt-import-js' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const occtimportjs: (options?: { locateFile?: (name: string) => string }) => Promise<any>;
  export default occtimportjs;
}
