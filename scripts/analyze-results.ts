import fs from "fs";

const report = JSON.parse(
  fs.readFileSync("./test-results/results.json", "utf8"),
);

// Clean Playwright ANSI colors
function cleanError(error: string = "") {
  const cleaned = error.replace(/\u001b\[[0-9;]*m/g, "");

  const lines = cleaned
    .split("\n")
    .filter((line) => line.includes("Expected") || line.includes("Received"));

  return lines.join("\n");
}

const bugMap = new Map<string, any>();

let totalTests = 0;
let totalPassed = 0;
let totalFailed = 0;

for (const suite of report.suites || []) {
  for (const spec of suite.specs || []) {
    for (const test of spec.tests || []) {
      const lastResult = test.results?.[test.results.length - 1];

      totalTests++;

      if (lastResult?.status === "passed") {
        totalPassed++;
      }

      if (lastResult?.status === "failed") {
        totalFailed++;
      }

      if (lastResult?.status !== "failed") {
        continue;
      }

      const key = `${spec.title}-${spec.file}-${spec.line}`;

      if (!bugMap.has(key)) {
        bugMap.set(key, {
          title: spec.title,
          browsers: [],
          status: "Needs Review",
          severity: "Medium",
          generatedAt: new Date().toISOString(),
          buildId:
            process.env.BUILD_BUILDID || process.env.GITHUB_RUN_ID || "local",
          retry: lastResult.retry,
          file: spec.file,
          line: spec.line,
          error: cleanError(lastResult.error?.message),
          attachments: [],
        });
      }

      const bug = bugMap.get(key);

      // Add browser
      if (!bug.browsers.includes(test.projectName)) {
        bug.browsers.push(test.projectName);
      }

      // Add attachments for this browser
      for (const attachment of lastResult.attachments || []) {
        const exists = bug.attachments.some(
          (a: any) =>
            a.browser === test.projectName && a.path === attachment.path,
        );

        if (!exists) {
          bug.attachments.push({
            browser: test.projectName,
            name: attachment.name,
            contentType: attachment.contentType,
            path: attachment.path,
          });
        }
      }
    }
  }
}

const candidateBugs = Array.from(bugMap.values());

// Summary
let summary = `
# Regression Failure Summary

Generated At:
${new Date().toISOString()}

Total Candidate Bugs:
${candidateBugs.length}

Total Tests:
${totalTests}

Passed:
${totalPassed}

Failed:
${totalFailed}

`;

for (const bug of candidateBugs) {
  summary += `
## ${bug.title}

Browsers:
${bug.browsers.join(", ")}

Location:
${bug.file}:${bug.line}

Status:
${bug.status}

Severity:
${bug.severity}

`;
}

// Dashboard
const dashboard = {
  generatedAt: new Date().toISOString(),
  buildId: process.env.BUILD_BUILDID || process.env.GITHUB_RUN_ID || "local",
  totalTests,
  totalPassed,
  totalFailed,
  totalCandidateBugs: candidateBugs.length,
  bugs: candidateBugs.map((bug) => ({
    title: bug.title,
    severity: bug.severity,
    status: bug.status,
    browsers: bug.browsers,
  })),
};

// Create folder
fs.mkdirSync("./candidate-bugs", {
  recursive: true,
});

// Create markdown bug files
for (const bug of candidateBugs) {
  const fileName = bug.title.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-");

  const attachmentList = bug.attachments?.length
    ? bug.attachments
        .map(
          (a: any) =>
            `- [${a.browser}] ${a.name}
  ${a.path}`,
        )
        .join("\n")
    : "No attachments found";

  const content = `# Candidate Bug

## Summary

Test "${bug.title}" failed on:

${bug.browsers.join(", ")}

This candidate bug was generated automatically by the Playwright Failure Analysis System.

---

## Title
${bug.title}

## Status
${bug.status}

## Severity
${bug.severity}

## Build ID
${bug.buildId}

## Generated At
${bug.generatedAt}

## Affected Browsers
${bug.browsers.join(", ")}

## Test Definition
${bug.file}:${bug.line}

## Retry Count
${bug.retry}

## Error

\`\`\`
${bug.error}
\`\`\`

## Attachments

${attachmentList}

## Recommendation

Review screenshots, videos and error context before creating an actual defect.

## Action Required

Manual Review Required before creating an actual defect.
`;

  fs.writeFileSync(`./candidate-bugs/${fileName}.md`, content);
}

// Save files
fs.writeFileSync(
  "./candidate-bugs/candidate-bugs.json",
  JSON.stringify(candidateBugs, null, 2),
);

fs.writeFileSync("./candidate-bugs/candidate-summary.md", summary);

fs.writeFileSync(
  "./candidate-bugs/candidate-dashboard.json",
  JSON.stringify(dashboard, null, 2),
);

console.log("\nCandidate Bugs Generated Successfully\n");

console.log(JSON.stringify(dashboard, null, 2));

/* 
console.log("\nCandidate Bugs Generated Successfully\n");

console.log(JSON.stringify(dashboard, null, 2)); */
