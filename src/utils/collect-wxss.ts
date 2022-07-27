import { readFile } from "fs/promises";
import { dirname, resolve } from "path";
import { defineRule, RuleType } from "../rules/interface";
import { isType } from "../walker/css";
import { parse } from "../parser";
import { existsSync } from "fs";

interface RuleEnv {
  currentPath: string;
  wxssPaths: string[];
  wxssSet: Set<string>;
}

/**
 * @param wxssPaths accept absoulte pathes of wxss file
 */
export const collectImportedWXSS = async (wxssPaths: string[], base?: string) => {
  const originPaths = wxssPaths.slice();
  const wxssSet = new Set(wxssPaths);

  const rule = defineRule<RuleEnv, RuleType.WXSS>({ name: "collect-imported-wxss", type: RuleType.WXSS }, (ctx) => {
    ctx.lifetimes({
      onVisit: (node) => {
        if (
          !isType(node, "Atrule") ||
          node.name !== "import" ||
          !node.prelude ||
          !isType(node.prelude, "AtrulePrelude")
        ) {
          return;
        }
        const { currentPath, wxssPaths, wxssSet } = ctx.env!;
        node.prelude.children.forEach((child) => {
          // type `String` for `import "style.wxss"`
          let path: string | null = null;
          if (isType(child, "String")) {
            // type `String` for `import "style.wxss"`
            path = child.value;
          } else if (isType(child, "Url") && isType(child.value, "String")) {
            // type `Url` for `import url("style.wxss")`
            path = child.value.value;
          }
          if (!path?.endsWith(".wxss")) return;
          path = resolve(dirname(currentPath), path);
          if (!existsSync(path) || wxssSet.has(path)) return;
          wxssSet.add(path);
          wxssPaths.push(path);
        });
      },
    });
  });

  for (const wxssPath of wxssPaths) {
    const wxss = (await readFile(wxssPath)).toString();
    const env = { currentPath: wxssPath, wxssSet, wxssPaths };
    parse({ wxss, Rules: [rule], env });
  }

  for (const wxssPath of originPaths) {
    wxssSet.delete(wxssPath); // remove non-imported wxss
  }
  return wxssSet;
};
