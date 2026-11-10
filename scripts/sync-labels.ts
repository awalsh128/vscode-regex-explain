/**
 * Creates and updates GitHub labels from .github/labels.yaml. Never deletes labels.
 *
 * Required environment variables:
 *
 * - GITHUB_TOKEN: GitHub API token with issues write permission
 * - GITHUB_REPOSITORY: Repository in "owner/repo" format
 */
import { Octokit } from "@octokit/rest";
import * as fs from "fs";
import * as yaml from "js-yaml";

/** One label in .github/labels.yaml. */
export interface LabelConfig {
  /** The label name. */
  name: string;
  /** Hex color, with or without a leading `#`. */
  color: string;
  /** Shown next to the label in GitHub. */
  description?: string;
}

/** The shape of .github/labels.yaml. */
interface LabelsFile {
  /** Every label the repository should have. */
  labels: LabelConfig[];
}

/**
 * Strips the leading `#` that the GitHub API does not accept.
 *
 * @param color A hex color.
 *
 * @returns The color without `#`.
 */
export function normalizeColor(color: string): string {
  return color.replace("#", "");
}

/**
 * Reads a required environment variable.
 *
 * @param name The variable name.
 * @param env The environment to read.
 *
 * @returns The value.
 *
 * @throws Error when the variable is unset or empty.
 */
export function requireEnv(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Parses the label configuration.
 *
 * @param content The YAML text of .github/labels.yaml.
 *
 * @returns The labels.
 */
export function parseLabelConfig(content: string): LabelConfig[] {
  return (yaml.load(content) as LabelsFile).labels;
}

/**
 * Checks whether an existing label differs from its configuration.
 *
 * @param existing The label as GitHub returns it.
 * @param desired The configured label.
 *
 * @returns Whether the color or description must change.
 */
export function needsUpdate(
  existing: { color: string; description: string | null },
  desired: LabelConfig
): boolean {
  return (
    existing.color !== normalizeColor(desired.color) ||
    existing.description !== (desired.description ?? "")
  );
}

/** Syncs the labels of the repository named by the environment. */
async function main(): Promise<void> {
  const octokit = new Octokit({ auth: requireEnv("GITHUB_TOKEN") });
  const [owner, repo] = requireEnv("GITHUB_REPOSITORY").split("/");
  const desired = parseLabelConfig(fs.readFileSync(".github/labels.yaml", "utf8"));
  const existing = await octokit.paginate(octokit.rest.issues.listLabelsForRepo, {
    owner,
    repo,
    per_page: 100,
  });
  const byName = new Map(existing.map((label) => [label.name, label]));

  for (const label of desired) {
    const current = byName.get(label.name);
    const fields = {
      owner,
      repo,
      name: label.name,
      color: normalizeColor(label.color),
      description: label.description ?? "",
    };
    if (!current) {
      console.log(`Creating: ${label.name}`);
      await octokit.rest.issues.createLabel(fields);
    } else if (needsUpdate(current, label)) {
      console.log(`Updating: ${label.name}`);
      await octokit.rest.issues.updateLabel(fields);
    } else {
      console.log(`Up to date: ${label.name}`);
    }
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
