import { Project, SyntaxKind, SourceFile } from "ts-morph";
import * as fs from "fs";
import * as path from "path";

const project = new Project({
  tsConfigFilePath: "tsconfig.json",
});

project.addSourceFilesAtPaths("src/components/reports/**/*.tsx");

const reportsPath = "src/components/reports";
const servicesMap = new Map<string, string[]>();

for (const sourceFile of project.getSourceFiles()) {
  const filePath = sourceFile.getFilePath();
  if (filePath.includes("DrillDownVoucherList.tsx")) continue;
  if (!filePath.includes(reportsPath)) continue;

  const folderName = path.basename(path.dirname(filePath));
  const serviceName = folderName.charAt(0).toUpperCase() + folderName.slice(1) + "ReportService";

  const functionDecl = sourceFile.getFunctions().find(f => f.isExported());
  if (!functionDecl) continue;

  const useERPStoreCall = functionDecl.getVariableDeclaration(node => {
    const init = node.getInitializer();
    return !!init && init.getKind() === SyntaxKind.CallExpression && init.getText().includes("useERPStore");
  });

  if (useERPStoreCall) {
    console.log("Refactoring:", functionDecl.getName(), "in", filePath);
    const storeVars = useERPStoreCall.getName();

    const dataDecl = functionDecl.getVariableDeclaration("data");
    if (dataDecl) {
      const init = dataDecl.getInitializerIfKind(SyntaxKind.CallExpression);
      if (init && init.getExpression().getText() === "useMemo") {
        const args = init.getArguments();
        if (args.length >= 2) {
          const arrowFunc = args[0].asKind(SyntaxKind.ArrowFunction);
          const depArray = args[1].asKind(SyntaxKind.ArrayLiteralExpression);

          if (arrowFunc && depArray) {
            const deps = depArray.getElements().map(e => e.getText());

            let storeKeys: string[] = [];
            if (storeVars.startsWith("{")) {
              storeKeys = storeVars.replace(/[{}]/g, "").split(",").map(s => s.trim());
            } else {
              storeKeys = ["state"];
            }

            const localDeps = deps.filter(d => !storeKeys.includes(d));

            let body = arrowFunc.getBodyText();
            if (!body) {
              const expr = arrowFunc.getExpression();
              if (expr) body = "return " + expr.getText() + ";";
            }

            const methodName = `get${functionDecl.getName()}Data`;
            const methodParams = localDeps.map(d => `${d}: any`).join(", ");
            const methodBody = `
  static ${methodName}(${methodParams}) {
    const state = useERPStore.getState();
    const ${storeVars} = state;
    ${body}
  }
`;
            if (!servicesMap.has(serviceName)) servicesMap.set(serviceName, []);
            servicesMap.get(serviceName)!.push(methodBody);

            // Replace useMemo in component
            const newMemoCall = `useMemo(() => ${serviceName}.${methodName}(${localDeps.join(", ")}), [${localDeps.join(", ")}])`;
            init.replaceWithText(newMemoCall);

            // Remove useERPStore call
            useERPStoreCall.getVariableStatement()?.remove();

            // Check if useERPStore import is unused and remove it
            const imports = sourceFile.getImportDeclarations();
            const erpImport = imports.find(i => i.getModuleSpecifierValue().includes("useERPStore"));
            if (erpImport) erpImport.remove();

            // Add Service import
            sourceFile.addImportDeclaration({
              namedImports: [serviceName],
              moduleSpecifier: `../../../lib/reporting/${serviceName}`,
            });

            sourceFile.saveSync();
          }
        }
      }
    }
  }
}

// Write Services
for (const [serviceName, methods] of servicesMap.entries()) {
  const servicePath = path.join(project.getCompilerOptions().rootDir || process.cwd(), `src/lib/reporting/${serviceName}.ts`);
  let content = "";
  if (fs.existsSync(servicePath)) {
    content = fs.readFileSync(servicePath, "utf-8");
    content = content.replace(/}\s*$/, `\n${methods.join("\n")}\n}`);
  } else {
    content = `import { useERPStore } from '../../store/useERPStore';\nimport { ReportEngine } from './ReportEngine';\n\nexport class ${serviceName} {\n${methods.join("\n")}\n}\n`;
  }
  fs.writeFileSync(servicePath, content);
}
console.log("Refactoring complete!");