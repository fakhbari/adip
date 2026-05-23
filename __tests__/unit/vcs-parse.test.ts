import { describe, it, expect } from "vitest";
import { parseRepositoryUrl } from "../../src/lib/vcs";

describe("parseRepositoryUrl", () => {
  it("parses an https github URL", () => {
    expect(parseRepositoryUrl("https://github.com/anthropic/claude-code")).toEqual({
      type: "github",
      owner: "anthropic",
      repo: "claude-code",
    });
  });

  it("strips a trailing .git", () => {
    expect(parseRepositoryUrl("https://github.com/anthropic/claude-code.git")).toEqual({
      type: "github",
      owner: "anthropic",
      repo: "claude-code",
    });
  });

  it("parses an SCP-style git@ URL", () => {
    expect(parseRepositoryUrl("git@github.com:anthropic/claude-code.git")).toEqual({
      type: "github",
      owner: "anthropic",
      repo: "claude-code",
    });
  });

  it("parses an SSH URL with a port", () => {
    expect(parseRepositoryUrl("ssh://git@github.com:22/anthropic/claude-code.git")).toEqual({
      type: "github",
      owner: "anthropic",
      repo: "claude-code",
    });
  });

  it("parses an SCP URL with a port", () => {
    expect(parseRepositoryUrl("git@github.com:22:anthropic/claude-code.git")).toEqual({
      type: "github",
      owner: "anthropic",
      repo: "claude-code",
    });
  });

  it("parses a GitLab URL with nested groups (preserves the full owner path)", () => {
    expect(parseRepositoryUrl("https://gitlab.com/group/sub/inner/repo")).toEqual({
      type: "gitlab",
      owner: "group/sub/inner",
      repo: "repo",
    });
  });

  it("parses a self-hosted GitLab URL", () => {
    expect(parseRepositoryUrl("https://gitlab.example.com/owner/repo.git")).toEqual({
      type: "gitlab",
      owner: "owner",
      repo: "repo",
    });
  });

  it("parses a Bitbucket URL", () => {
    expect(parseRepositoryUrl("https://bitbucket.org/team/proj")).toEqual({
      type: "bitbucket",
      owner: "team",
      repo: "proj",
    });
  });

  it("returns null for an unknown host", () => {
    expect(parseRepositoryUrl("https://example.com/owner/repo")).toBeNull();
  });

  it("returns null when path lacks owner+repo", () => {
    expect(parseRepositoryUrl("https://github.com/")).toBeNull();
    expect(parseRepositoryUrl("https://github.com/owner")).toBeNull();
  });

  it("returns null for empty / non-string input", () => {
    expect(parseRepositoryUrl("")).toBeNull();
    // Cast to bypass TS for runtime check.
    expect(parseRepositoryUrl(undefined as unknown as string)).toBeNull();
  });
});
