import fs from "fs";

// Read all candidate bugs
const candidateBugs = JSON.parse(
  fs.readFileSync(
    "./regression-download/candidate-bugs/candidate-bugs.json",
    "utf8",
  ),
);

// Read approvals from approve.json
const approval = JSON.parse(
  fs.readFileSync("./candidate-bugs/approve.json", "utf8"),
);

const approvedTitles = approval.approved || [];

// Filter approved bugs
const approvedBugs = candidateBugs.filter((bug: any) =>
  approvedTitles.includes(bug.title),
);

// Save approved bugs
fs.writeFileSync(
  "./candidate-bugs/approved-bugs.json",
  JSON.stringify(approvedBugs, null, 2),
);

console.log(`Approved ${approvedBugs.length} bug(s)\n`);

console.log(JSON.stringify(approvedBugs, null, 2));
