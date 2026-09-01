export function resolveImportPath(path: string) {
  return process.env.NODE_ENV === "production" ? path + ".js" : path + ".ts";
}
