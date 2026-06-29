import fs from "fs";
import axios from "axios";
import path from "path";
import { findDuplicateBug } from "./ado-helper";

const DRY_RUN = process.env.DRY_RUN === "true";

const bugs = JSON.parse(
  fs.readFileSync(
    "./regression-download/candidate-bugs/candidate-bugs.json",
    "utf8",
  ),
);

console.log("================================");
console.log("Approved Bugs:", bugs.length);
console.log(bugs.map((b: any) => b.title));
console.log("DRY_RUN:", DRY_RUN);
console.log("ADO_ORG:", process.env.ADO_ORG);
console.log("ADO_PROJECT:", process.env.ADO_PROJECT);
console.log("ADO_PAT Exists:", !!process.env.ADO_PAT);
console.log("================================");

const org = process.env.ADO_ORG!;
const project = process.env.ADO_PROJECT!;
const pat = process.env.ADO_PAT!;

const auth = Buffer.from(`:${pat}`).toString("base64");

async function uploadAttachment(filePath: string) {
  const url = `https://dev.azure.com/${org}/${project}/_apis/wit/attachments?fileName=${path.basename(
    filePath,
  )}&api-version=7.1`;

  const response = await axios.post(url, fs.readFileSync(filePath), {
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/octet-stream",
    },
  });

  return response.data.url;
}

async function attachFileToBug(
  bugId: number,
  attachmentUrl: string,
  fileName: string,
) {
  const url = `https://dev.azure.com/${org}/${project}/_apis/wit/workitems/${bugId}?api-version=7.1`;

  await axios.patch(
    url,
    [
      {
        op: "add",
        path: "/relations/-",
        value: {
          rel: "AttachedFile",
          url: attachmentUrl,
          attributes: {
            comment: fileName,
          },
        },
      },
    ],
    {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json-patch+json",
      },
    },
  );
}

async function createBug(bug: any) {
  console.log(`\nProcessing: ${bug.title}`);

  try {
    const duplicates = await findDuplicateBug(bug.title);

    if (duplicates.length) {
      console.log(`
⚠️ Duplicate Bug Found
Title : ${bug.title}
Existing Bug ID : ${duplicates[0].id}
Skipping creation.
`);

      return;
    }

    if (DRY_RUN) {
      console.log(`
Would create bug:
${bug.title}
`);

      return;
    }

    const body = [
      {
        op: "add",
        path: "/fields/System.Title",
        value: `[Candidate Bug] ${bug.title}`,
      },
      {
        op: "add",
        path: "/fields/System.Description",
        value: `
<h3>Failure Details</h3>

<b>Status:</b> ${bug.status}<br>
<b>Severity:</b> ${bug.severity}<br>
<b>Browsers:</b> ${bug.browsers.join(", ")}<br>
<b>Location:</b> ${bug.file}:${bug.line}<br>

<h3>Error</h3>

<pre>
${bug.error}
</pre>
`,
      },
    ];

    const url = `https://dev.azure.com/${org}/${project}/_apis/wit/workitems/$Bug?api-version=7.1`;

    const response = await axios.patch(url, body, {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json-patch+json",
      },
    });

    const bugId = response.data.id;

    console.log(`✅ Bug Created : ${bugId}`);

    for (const attachment of bug.attachments || []) {
      try {
        if (!fs.existsSync(attachment.path)) {
          console.log(`❌ File not found: ${attachment.path}`);

          continue;
        }

        console.log(`📤 Uploading [${attachment.browser}] ${attachment.name}`);

        const attachmentUrl = await uploadAttachment(attachment.path);

        await attachFileToBug(
          bugId,
          attachmentUrl,
          `${attachment.browser}-${attachment.name}`,
        );

        console.log(`✅ Attached [${attachment.browser}] ${attachment.name}`);
      } catch (error: any) {
        console.log(
          `❌ Failed to upload [${attachment.browser}] ${attachment.name}`,
        );

        console.log(error.message);
      }
    }
  } catch (error: any) {
    console.log(`❌ Error processing ${bug.title}`);

    console.log(error.message);
  }
}

(async () => {
  if (!bugs.length) {
    console.log("No approved bugs found.");

    return;
  }

  for (const bug of bugs) {
    await createBug(bug);
  }

  console.log("\nFinished processing all approved bugs.");
})();
