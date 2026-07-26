import { Project, SyntaxKind, VariableDeclaration, CallExpression, ArrowFunction } from "ts-morph";

const project = new Project({
  tsConfigFilePath: "tsconfig.json",
});

project.addSourceFilesAtPaths("src/components/reports/**/*.tsx");

const sourceFile = project.getSourceFile("src/components/reports/purchase/PurchaseSummary.tsx");

if (sourceFile) {
  console.log("Found file!");
  
  // Find the component function
  const functionDecl = sourceFile.getFunction("PurchaseSummary");
  if (functionDecl) {
    // Find useERPStore call
    const useERPStoreCall = functionDecl.getVariableDeclaration(node => {
      const init = node.getInitializer();
      return init && init.getKind() === SyntaxKind.CallExpression && init.getText() === "useERPStore()";
    });

    if (useERPStoreCall) {
      console.log("Found useERPStore:", useERPStoreCall.getText());
      const storeVars = useERPStoreCall.getName(); // e.g., "{ purchases, suppliers }"
      
      // Find `const data = useMemo(...)`
      const dataDecl = functionDecl.getVariableDeclaration("data");
      if (dataDecl) {
        const init = dataDecl.getInitializerIfKind(SyntaxKind.CallExpression);
        if (init && init.getExpression().getText() === "useMemo") {
          const args = init.getArguments();
          const arrowFunc = args[0].asKind(SyntaxKind.ArrowFunction);
          const depArray = args[1].asKind(SyntaxKind.ArrayLiteralExpression);
          
          if (arrowFunc && depArray) {
            console.log("Found useMemo dependencies:", depArray.getText());
            const deps = depArray.getElements().map(e => e.getText());
            
            // Separate store deps from local deps
            // We assume anything destructured from storeVars is a store dep
            let storeKeys: string[] = [];
            if (storeVars.startsWith("{")) {
              storeKeys = storeVars.replace(/[{}]/g, "").split(",").map(s => s.trim());
            } else {
               // if it's `const state = useERPStore()`
            }

            const localDeps = deps.filter(d => !storeKeys.includes(d));
            console.log("Local deps:", localDeps);
            
            // Body of useMemo
            let body = arrowFunc.getBodyText();
            if (!body) {
              const expr = arrowFunc.getExpression();
              if (expr) body = "return " + expr.getText() + ";";
            }
            
            // Build the static method code
            const methodName = `get${functionDecl.getName()}Data`;
            const methodParams = localDeps.map(d => `${d}: any`).join(", ");
            const methodBody = `
  const state = useERPStore.getState();
  const ${storeVars} = state;
  ${body}
            `;
            console.log(`\nstatic ${methodName}(${methodParams}) {${methodBody}\n}`);
          }
        }
      }
    }
  }
} else {
  console.log("File not found");
}
