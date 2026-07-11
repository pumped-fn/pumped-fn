declare module "virtual:editor-types" {
  const payload: {
    libs: Record<string, string>
    files: Record<string, string>
  }
  export default payload
}
