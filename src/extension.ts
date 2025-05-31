import {
  defineExtension,
  useActiveTextEditor,
  useCommand,
  useDocumentText,
  useEvent,
} from "reactive-vscode";
import { window, workspace } from "vscode";
import { useAgentProvider } from "./composables/useAgentProvider";
import { parseGraphAIObject } from "./composables/useGraphAIParser";
import { useMermaidWebview } from "./composables/useMermaidWebview";
import { fetchAgentIndex } from "./lib/fetchAgentIndex";
import { logger } from "./utils";

// @ts-ignore
export = defineExtension(async () => {
  logger.info("Extension Activated");
  const onDidSaveTextDocument = useEvent(workspace.onDidSaveTextDocument);
  const onDidOpenTextDocument = useEvent(workspace.onDidOpenTextDocument);

  // 起動時にagentIndexを取得
  const agentIndex = await fetchAgentIndex();

  // Auto-launch for *.ai.yaml files
  onDidOpenTextDocument((document) => {
    const fileName = document.fileName;
    if (fileName.endsWith(".ai.yaml") && document.languageId === "yaml") {
      // Small delay to ensure the editor is ready
      setTimeout(() => {
        const editor = window.activeTextEditor;
        if (editor && editor.document === document) {
          const text = document.getText();
          const fileNameOnly = fileName.split("/").pop() || fileName.split("\\").pop() || "";
          
          const { panel, updateGraph } = useMermaidWebview(fileNameOnly);
          panel.reveal();
          updateGraph(text, "yaml");
          
          logger.info(`Auto-launched GraphAI visualization for ${fileNameOnly}`);
        }
      }, 100);
    }
  });

  /**
   * Show graph from JSON, YAML file or TypeScript selection
   */
  useCommand("graphai-visualizer.showGraph", async () => {
    const editor = useActiveTextEditor();
    if (!editor.value) {
      window.showErrorMessage("Editor is not active.");
      return;
    }

    const document = editor.value.document;
    const fileLanguageId = document.languageId;
    const fileName =
      document.fileName?.split("/").pop() ||
      document.fileName?.split("\\").pop() ||
      "";
    const openFileUri = document.uri.toString();
    const position = editor.value.selection.active;

    // For JSON or YAML files
    if (fileLanguageId === "json" || fileLanguageId === "yaml") {
      const text = useDocumentText(() => editor.value?.document);

      const { panel, updateGraph } = useMermaidWebview(fileName);
      panel.reveal();

      updateGraph(text.value ?? "", fileLanguageId);
      onDidSaveTextDocument((document) => {
        if (openFileUri === document.uri.toString()) {
          // Check format on save
          if (
            document.languageId === "json" ||
            document.languageId === "yaml"
          ) {
            updateGraph(document.getText(), document.languageId);
          }
        }
      });
      return;
    }

    // For TypeScript files
    if (fileLanguageId === "typescript") {
      // Parse GraphAI object
      const jsonData = await parseGraphAIObject(document, position);
      logger.info(jsonData);

      if (jsonData) {
        const { panel, updateGraph } = useMermaidWebview(fileName);
        panel.reveal();
        updateGraph(jsonData, "json");

        onDidSaveTextDocument(async (document) => {
          if (openFileUri === document.uri.toString()) {
            const jsonData = await parseGraphAIObject(document, position);
            if (jsonData) {
              updateGraph(jsonData, "json");
            }
          }
        });
        return;
      }

      window.showErrorMessage(
        "No GraphAI object found at the selection position.",
      );
      return;
    }

    // Unsupported file format
    window.showErrorMessage(
      "Unsupported file format. Only JSON, YAML, or TypeScript files are supported.",
    );
  });

  const { hoverProvider, linkProvider, dispose } = useAgentProvider(agentIndex);

  return {
    hoverProvider,
    linkProvider,
    dispose,
  };
});
