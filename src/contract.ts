export const sourceFiles = import.meta.glob("../contracts/NoticeDelta.py", { query: "?raw", eager: true, import: "default" });
export const contractSource = String(sourceFiles["../contracts/NoticeDelta.py"] || "");
