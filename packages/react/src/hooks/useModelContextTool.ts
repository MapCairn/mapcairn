// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { useEffect } from "react";
import { useLatestRef } from "./useLatestRef";

/** A single content block in a WebMCP tool's result, as consumed by the calling agent. */
export interface ModelContextToolContentBlock {
  type: "text";
  text: string;
}

/** The value a WebMCP tool's `execute` function resolves to. */
export interface ModelContextToolResult {
  content: ModelContextToolContentBlock[];
}

/**
 * A WebMCP tool definition, as registered via `document.modelContext.registerTool()`.
 * @remarks `inputSchema` is a JSON Schema object describing `execute`'s single
 *   argument; pass `{ type: "object", properties: {}, additionalProperties: false }`
 *   for a tool that takes no input.
 */
export interface ModelContextToolDefinition<TInput = unknown> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (
    input: TInput,
  ) => Promise<ModelContextToolResult> | ModelContextToolResult;
}

/**
 * WebMCP's tool-registration entry point, the value of `document.modelContext`
 * (Chrome origin trial, see https://webmachinelearning.github.io/webmcp/).
 * @remarks The SDK does not add `modelContext` to the global `Document` type,
 *   because a global augmentation does not survive the built declarations.
 *   Type a stub or a read with this interface instead.
 */
export interface ModelContextProvider {
  registerTool: (
    tool: {
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
      execute: (input: unknown) => Promise<ModelContextToolResult>;
    },
    options?: { signal?: AbortSignal },
  ) => Promise<void>;
}

/**
 * The document's WebMCP entry point. It is undefined in browsers without
 * WebMCP support, when the `tools` Permissions-Policy denies it, and in SSR.
 */
function modelContextOf(): ModelContextProvider | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }
  const provider: unknown = Reflect.get(document, "modelContext");
  return provider ? (provider as ModelContextProvider) : undefined;
}

/** Whether the current document exposes the WebMCP `document.modelContext` API. */
export function isModelContextSupported(): boolean {
  return modelContextOf() !== undefined;
}

/**
 * Registers a WebMCP tool for the lifetime of the calling component, so an
 * in-browser AI agent can discover and call it via `document.modelContext`.
 * @param definition - The tool to register, or `null` to skip registration
 *   (e.g. a tool that only makes sense when some optional data is present).
 * @remarks A no-op, including in SSR, wherever `document.modelContext` is
 *   unsupported or denied by Permissions-Policy; `registerTool` can reject
 *   asynchronously (e.g. a Permissions-Policy denial delivered as a promise)
 *   or throw synchronously (e.g. a spec-validation error on a malformed
 *   `inputSchema`), and both are caught the same way: never re-thrown into
 *   the component tree, since there's nothing meaningful to surface to the
 *   user for what is inherently a progressive enhancement, but still logged
 *   via `console.error` with the tool's name so a genuinely malformed
 *   `inputSchema` from a real consumer is visible during development.
 *   Re-registers only when `definition`'s `name` changes identity (including transitions
 *   to/from `null`); `description` and `inputSchema` are captured at
 *   registration time, since every current caller's schema is static for a
 *   given tool name, and a fresh `execute` closure on every render (the
 *   common case, since it closes over current component state) is read via
 *   a ref instead, so it can't itself trigger register/unregister churn.
 */
export function useModelContextTool<TInput = unknown>(
  definition: ModelContextToolDefinition<TInput> | null,
): void {
  const executeRef = useLatestRef(definition?.execute);

  // biome-ignore lint/correctness/useExhaustiveDependencies: definition?.name is a re-registration trigger; description/inputSchema are intentionally captured from this closure at registration time rather than kept live, so `definition` itself isn't a live dependency here; only `execute` is (via executeRef)
  useEffect(() => {
    const currentDefinition = definition;
    const modelContext = modelContextOf();
    if (!currentDefinition || !modelContext) {
      return;
    }

    const controller = new AbortController();
    try {
      modelContext
        .registerTool(
          {
            name: currentDefinition.name,
            description: currentDefinition.description,
            inputSchema: currentDefinition.inputSchema,
            execute: async (input: unknown) => {
              const execute = executeRef.current;
              if (!execute) {
                throw new Error(
                  `Model context tool "${currentDefinition.name}" is no longer available.`,
                );
              }
              return execute(input as TInput);
            },
          },
          { signal: controller.signal },
        )
        .catch((error) => {
          console.error(
            `useModelContextTool: registerTool rejected for tool "${currentDefinition.name}"`,
            error,
          );
        });
    } catch (error) {
      console.error(
        `useModelContextTool: registerTool threw synchronously for tool "${currentDefinition.name}"`,
        error,
      );
    }

    return () => controller.abort();
  }, [definition?.name]);
}
