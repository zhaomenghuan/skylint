import chalk from "chalk";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { parse } from "../parser";
import { defineRule, RuleType } from "../rules/interface";
import { serialize } from "../serilizer/html";
import { isType, Node } from "../walker/html";
import { ChildNode, ParentNode } from "domhandler";

interface CollectTemplateEnv {
  currentPath: string;
  wxmlPaths: string[];
  tmplFragments: Map<string, ParentNode>;
  importFragments: Map<string, ParentNode>;
  includeFragments: Map<string, ParentNode>;
}

// TODO avoid name conflict
const getUniqueKey = (path: string, tmplName: string) => `${tmplName}`;

const naivePrint = (ast: Node) => {
  console.log(
    JSON.stringify(
      ast,
      (key, value) => {
        if (["parentNode", "parent", "next", "prev", "sourceCodeLocation"].includes(key)) return undefined;
        if (key === "tagName") return chalk.green(value);
        return value;
      },
      2
    )
  );
};

const replaceChildWithChildren = (child: ChildNode, children: ChildNode[]) => {
  const parent = child.parentNode;
  if (!parent) return false;
  parent.childNodes = parent.children = parent.childNodes.flatMap((childNode) => {
    if (childNode === child) {
      const newChildren = children.map((originChild) => {
        return {
          ...originChild,
          parent,
          parentNode: parent,
          sourceCodeLocation: null,
        } as ChildNode;
      });
      const firstChild = newChildren.at(0);
      const lastChild = newChildren.at(-1);
      if (firstChild) firstChild.previousSibling = firstChild.prev = child.prev;
      if (lastChild) lastChild.nextSibling = lastChild.next = child.next;
      return newChildren;
    }
    return childNode;
  });
  return true;
};

// TODO scope of import and include
const Rule = defineRule<CollectTemplateEnv, RuleType.WXML>({ name: "collect-template", type: RuleType.WXML }, (ctx) => {
  ctx.lifetimes({
    onVisit: (node, walkerContext) => {
      if (!ctx.env) return;
      if (!isType(node, "Tag")) return;
      if (node.name === "template") {
        // <template is="tmpl"/>
        const { is, name } = node.attribs;
        if (is) {
          const key = getUniqueKey(ctx.env.currentPath, is);
          const tmpl = ctx.env.tmplFragments.get(key);
          if (!tmpl) return;
          replaceChildWithChildren(node, tmpl.childNodes);
        } else if (name) {
          const key = getUniqueKey(ctx.env.currentPath, name);
          if (ctx.env.tmplFragments.has(key)) return;
          ctx.env.tmplFragments.set(key, node);
          replaceChildWithChildren(node, []);
        }
      } else if (node.name === "include") {
        // <include src="header.wxml"/>
        const { src } = node.attribs;
        if (!src) return;
        const srcPath = resolve(dirname(ctx.env.currentPath), src);
        let srcAST = ctx.env.includeFragments.get(srcPath);
        if (!srcAST) [srcAST] = collectTemplate([srcPath], ctx.env);
        // naivePrint(srcAST);
        replaceChildWithChildren(node, srcAST.childNodes);
      } else if (node.name === "import") {
        // <import src="header.wxml"/>
        const { src } = node.attribs;
        const srcPath = resolve(dirname(ctx.env.currentPath), src);
        let srcAST = ctx.env.importFragments.get(srcPath);
        if (!srcAST) [srcAST] = collectTemplate([srcPath], ctx.env);
        replaceChildWithChildren(node, []);
      }
    },
  });
});

export const collectTemplate = (wxmlPaths: string[], env?: CollectTemplateEnv) => {
  const originalPaths = [...wxmlPaths];
  const newEnv = env ?? {
    currentPath: "",
    wxmlPaths,
    importFragments: new Map(),
    includeFragments: new Map(),
    tmplFragments: new Map(),
  };

  return wxmlPaths.map((currentPath) => {
    const wxml = readFileSync(currentPath).toString();
    let { astWXML } = parse({ wxml, Rules: [Rule], env: { ...newEnv, currentPath } });
    // astWXML = parse({ wxml, Rules: [Rule], env: { ...env, currentPath } }).astWXML;

    // if (!astWXML) return;
    const content = serialize(astWXML!);
    console.log(chalk.red(currentPath));
    // naivePrint(astWXML!);

    console.log(content);
    return astWXML!;
  });
};