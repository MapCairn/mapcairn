// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  ApiAbstractMixin,
  ApiClass,
  type ApiDeclaredItem,
  ApiEnum,
  ApiInterface,
  type ApiItem,
  ApiItemKind,
  ApiNamespace,
  ApiPackage,
  ApiParameterListMixin,
  ApiReadonlyMixin,
  ApiReleaseTagMixin,
  ApiReturnTypeMixin,
  ApiStaticMixin,
  ApiTypeParameterListMixin,
  type Excerpt,
  ReleaseTag,
} from "@microsoft/api-extractor-model";
import { type DocNodeLike, type LinkResolver, renderDocNode } from "./markdown";

/** What kind of declaration an export is. */
export type ExportKind =
  | "function"
  | "class"
  | "interface"
  | "typeAlias"
  | "variable"
  | "namespace"
  | "enum";

/** What kind of declaration a member of an export is. */
export type MemberKind =
  | "property"
  | "method"
  | "constructor"
  | "callSignature"
  | "constructSignature"
  | "indexSignature"
  | "enumMember"
  | "variable";

/** A parameter or type parameter, with the description its comment gives. */
export interface ApiParameter {
  readonly name: string;
  /** The declared type as written, empty for a type parameter without a constraint. */
  readonly type: string;
  readonly description: string;
  readonly optional: boolean;
}

/** A member of an interface, class, namespace or enum. */
export interface ApiMember {
  readonly name: string;
  readonly kind: MemberKind;
  readonly signature: string;
  readonly summary: string;
  readonly parameters: readonly ApiParameter[];
  readonly returns: string;
  readonly deprecated: string;
}

/** A name another export's page can link to. */
export interface ApiReference {
  readonly packageName: string;
  readonly name: string;
}

/** Everything the catalogue shows about one export of a package. */
export interface ApiExport {
  readonly name: string;
  readonly kind: ExportKind;
  readonly packageName: string;
  readonly signature: string;
  /** The comment's summary, in Markdown; empty when the export has none. */
  readonly summary: string;
  readonly remarks: string;
  readonly parameters: readonly ApiParameter[];
  readonly typeParameters: readonly ApiParameter[];
  readonly returnType: string;
  readonly returns: string;
  readonly examples: readonly string[];
  readonly since: string;
  readonly deprecated: string;
  readonly see: readonly string[];
  readonly throws: readonly string[];
  readonly members: readonly ApiMember[];
  /** The types the signature names, for the related list. */
  readonly references: readonly ApiReference[];
  /** The names this declaration extends or implements. */
  readonly bases: readonly ApiReference[];
  readonly releaseTag: "public" | "beta" | "alpha";
}

const EXPORT_KINDS: ReadonlyMap<ApiItemKind, ExportKind> = new Map([
  [ApiItemKind.Function, "function"],
  [ApiItemKind.Class, "class"],
  [ApiItemKind.Interface, "interface"],
  [ApiItemKind.TypeAlias, "typeAlias"],
  [ApiItemKind.Variable, "variable"],
  [ApiItemKind.Namespace, "namespace"],
  [ApiItemKind.Enum, "enum"],
]);

const MEMBER_KINDS: ReadonlyMap<ApiItemKind, MemberKind> = new Map([
  [ApiItemKind.Property, "property"],
  [ApiItemKind.PropertySignature, "property"],
  [ApiItemKind.Method, "method"],
  [ApiItemKind.MethodSignature, "method"],
  [ApiItemKind.Constructor, "constructor"],
  [ApiItemKind.CallSignature, "callSignature"],
  [ApiItemKind.ConstructSignature, "constructSignature"],
  [ApiItemKind.IndexSignature, "indexSignature"],
  [ApiItemKind.EnumMember, "enumMember"],
  [ApiItemKind.Variable, "variable"],
]);

/** A tag that holds one value or a list in a comment, by its name. */
const SINCE_TAG = "@since";
const EXAMPLE_TAG = "@example";
const THROWS_TAG = "@throws";

function render(node: DocNodeLike | undefined, resolve: LinkResolver): string {
  return node ? renderDocNode(node, resolve).trim() : "";
}

function describedBy(item: ApiItem, resolve: LinkResolver): string {
  const comment = (item as ApiDeclaredItem).tsdocComment;
  return render(comment?.summarySection as DocNodeLike | undefined, resolve);
}

function blocksNamed(
  item: ApiItem,
  tagName: string,
  resolve: LinkResolver,
): string[] {
  const comment = (item as ApiDeclaredItem).tsdocComment;
  return (comment?.customBlocks ?? [])
    .filter((block) => block.blockTag.tagName.toLowerCase() === tagName)
    .map((block) => render(block.content as DocNodeLike, resolve))
    .filter((text) => text !== "");
}

function parametersOf(
  item: ApiItem,
  resolve: LinkResolver,
): readonly ApiParameter[] {
  if (!ApiParameterListMixin.isBaseClassOf(item)) {
    return [];
  }
  return item.parameters.map((parameter) => ({
    name: parameter.name,
    type: parameter.parameterTypeExcerpt.text.trim(),
    description: render(
      parameter.tsdocParamBlock?.content as DocNodeLike | undefined,
      resolve,
    ),
    optional: parameter.isOptional,
  }));
}

function typeParametersOf(
  item: ApiItem,
  resolve: LinkResolver,
): readonly ApiParameter[] {
  if (!ApiTypeParameterListMixin.isBaseClassOf(item)) {
    return [];
  }
  return item.typeParameters.map((parameter) => ({
    name: parameter.name,
    type: parameter.constraintExcerpt.text.trim(),
    description: render(
      parameter.tsdocTypeParamBlock?.content as DocNodeLike | undefined,
      resolve,
    ),
    optional: parameter.isOptional,
  }));
}

function referencesIn(excerpt: Excerpt | undefined): ApiReference[] {
  const found: ApiReference[] = [];
  for (const token of excerpt?.spannedTokens ?? []) {
    const reference = token.canonicalReference?.toString();
    const match = reference ? /^(.+?)!([^:.]+)/.exec(reference) : null;
    if (match?.[1] !== undefined && match[2] !== undefined) {
      found.push({ packageName: match[1], name: match[2] });
    }
  }
  return found;
}

function returnTypeOf(item: ApiItem): string {
  return ApiReturnTypeMixin.isBaseClassOf(item)
    ? item.returnTypeExcerpt.text.trim()
    : "";
}

function deprecatedOf(item: ApiItem, resolve: LinkResolver): string {
  const comment = (item as ApiDeclaredItem).tsdocComment;
  return render(comment?.deprecatedBlock?.content as DocNodeLike, resolve);
}

function returnsOf(item: ApiItem, resolve: LinkResolver): string {
  const comment = (item as ApiDeclaredItem).tsdocComment;
  return render(comment?.returnsBlock?.content as DocNodeLike, resolve);
}

/**
 * The declaration as it is written, without a leading `export` and `declare`,
 * so a signature reads like the code a person would write.
 */
function signatureOf(item: ApiItem): string {
  const text = (item as ApiDeclaredItem).excerpt.text.trim();
  return text.replace(/^export\s+(declare\s+)?/, "").replace(/^declare\s+/, "");
}

function memberSignature(item: ApiItem): string {
  const base = (item as ApiDeclaredItem).excerpt.text.trim();
  const flags = [
    ApiStaticMixin.isBaseClassOf(item) && item.isStatic ? "static" : "",
    ApiAbstractMixin.isBaseClassOf(item) && item.isAbstract ? "abstract" : "",
    ApiReadonlyMixin.isBaseClassOf(item) && item.isReadonly ? "readonly" : "",
  ].filter((flag) => flag !== "" && !base.startsWith(`${flag} `));
  return [...flags, base].join(" ");
}

function memberOf(
  item: ApiItem,
  kind: MemberKind,
  resolve: LinkResolver,
): ApiMember {
  return {
    name: item.displayName,
    kind,
    signature: memberSignature(item),
    summary: describedBy(item, resolve),
    parameters: parametersOf(item, resolve),
    returns: returnsOf(item, resolve),
    deprecated: deprecatedOf(item, resolve),
  };
}

function membersOf(item: ApiItem, resolve: LinkResolver): ApiMember[] {
  const members: ApiMember[] = [];
  for (const member of item.members) {
    const kind = MEMBER_KINDS.get(member.kind);
    if (kind !== undefined) {
      members.push(memberOf(member, kind, resolve));
    }
  }
  return members;
}

function basesOf(item: ApiItem): ApiReference[] {
  if (item instanceof ApiClass) {
    return [
      ...referencesIn(item.extendsType?.excerpt),
      ...item.implementsTypes.flatMap((type) => referencesIn(type.excerpt)),
    ];
  }
  if (item instanceof ApiInterface) {
    return item.extendsTypes.flatMap((type) => referencesIn(type.excerpt));
  }
  return [];
}

function releaseTagOf(item: ApiItem): ApiExport["releaseTag"] {
  if (!ApiReleaseTagMixin.isBaseClassOf(item)) {
    return "public";
  }
  if (item.releaseTag === ReleaseTag.Beta) {
    return "beta";
  }
  return item.releaseTag === ReleaseTag.Alpha ? "alpha" : "public";
}

function memberReferences(item: ApiItem): ApiReference[] {
  return item.members.flatMap((member) =>
    referencesIn((member as ApiDeclaredItem).excerpt),
  );
}

/**
 * The exports of the entry point an API model describes, in the order the
 * model lists them (alphabetical). An export the comment marks `@internal` is
 * not in the model, so it never reaches the catalogue.
 * @param modelFile - The path of an `.api.json` file.
 * @param resolve - Turns a `{@link}` target into a page address.
 */
export function extractExports(
  modelFile: string,
  resolve: LinkResolver,
): ApiExport[] {
  const pkg = ApiPackage.loadFromJsonFile(modelFile);
  const exports: ApiExport[] = [];
  for (const entry of pkg.entryPoints) {
    for (const item of entry.members) {
      const kind = EXPORT_KINDS.get(item.kind);
      if (kind === undefined) {
        continue;
      }
      const declared = item as ApiDeclaredItem;
      const isContainer =
        item instanceof ApiNamespace ||
        item instanceof ApiEnum ||
        item instanceof ApiInterface ||
        item instanceof ApiClass;
      exports.push({
        name: item.displayName,
        kind,
        packageName: pkg.name,
        signature: signatureOf(item),
        summary: describedBy(item, resolve),
        remarks: render(
          declared.tsdocComment?.remarksBlock?.content as DocNodeLike,
          resolve,
        ),
        parameters: parametersOf(item, resolve),
        typeParameters: typeParametersOf(item, resolve),
        returnType: returnTypeOf(item),
        returns: returnsOf(item, resolve),
        examples: blocksNamed(item, EXAMPLE_TAG, resolve),
        since: blocksNamed(item, SINCE_TAG, resolve)[0] ?? "",
        deprecated: deprecatedOf(item, resolve),
        see: (declared.tsdocComment?.seeBlocks ?? [])
          .map((block) => render(block.content as DocNodeLike, resolve))
          .filter((text) => text !== ""),
        throws: blocksNamed(item, THROWS_TAG, resolve),
        members: isContainer ? membersOf(item, resolve) : [],
        references: [
          ...referencesIn(declared.excerpt),
          ...(isContainer ? memberReferences(item) : []),
        ].filter((reference) => reference.name !== item.displayName),
        bases: basesOf(item),
        releaseTag: releaseTagOf(item),
      });
    }
  }
  return exports;
}
