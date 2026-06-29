import fs from "fs";
import axios from "axios";
import path from "path";

const DRY_RUN = false;

const bugs = JSON.parse(
  fs.readFileSync(
    "./candidate-bugs/candidate-bugs.json",
    "utf8"
  )
);

const org = process.env.ADO_ORG!;
const project = process.env.ADO_PROJECT!;
const pat = process.env.ADO_PAT!;

const auth = Buffer.from(`:${pat}`).toString(
  "base64"
);

async function uploadAttachment(
  filePath: string
) {
  const url =
    `https://dev.azure.com/${org}/${project}/_apis/wit/attachments?fileName=${path.basename(
      filePath
    )}&api-version=7.1`;

  const response = await axios.post(
    url,
    fs.readFileSync(filePath),
    {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type":
          "application/octet-stream",
      },
    }
  );

  return response.data.url;
}

async function attachFileToBug(
  bugId: number,
  attachmentUrl: string,
  fileName: string
) {
  const url =
    `https://dev.azure.com/${org}/${project}/_apis/wit/workitems/${bugId}?api-version=7.1`;

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
        "Content-Type":
          "application/json-patch+json",
      },
    }
  );
}

async function createBug(bug: any) {
  if (DRY_RUN) {
    console.log(
      `Would create bug:\n${bug.title}`
    );
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
      path:
        "/fields/System.Description",
      value: `
<h3>Failure Details</h3>

<b>Status:</b> ${bug.status}<br>
<b>Severity:</b> ${bug.severity}<br>
<b>Browsers:</b> ${bug.browsers.join(
        ", "
      )}<br>
<b>Location:</b> ${bug.file}:${
        bug.line
      }<br>

<h3>Error</h3>

<pre>
${bug.error}
</pre>
`,
    },
  ];

  const url =
    `https://dev.azure.com/${org}/${project}/_apis/wit/workitems/$Bug?api-version=7.1`;

  const response =
    await axios.patch(
      url,
      body,
      {
        headers: {
          Authorization:
            `Basic ${auth}`,
          "Content-Type":
            "application/json-patch+json",
        },
      }
    );

  const bugId =
    response.data.id;

  console.log(
    `✅ Bug Created : ${bugId}`
  );

  // Upload and attach files
  for (
    const attachment of
    bug.attachments || []
  ) {
    try {
      if (
        !fs.existsSync(
          attachment.path
        )
      ) {
        console.log(
          `❌ File not found: ${attachment.path}`
        );
        continue;
      }

      console.log(
        `📤 Uploading ${attachment.name}`
      );

      const attachmentUrl =
        await uploadAttachment(
          attachment.path
        );

      await attachFileToBug(
        bugId,
        attachmentUrl,
        attachment.name
      );

      console.log(
        `✅ Attached ${attachment.name}`
      );
    } catch (error: any) {
      console.log(
        `❌ Failed to upload ${attachment.name}`
      );
      console.log(
        error.message
      );
    }
  }
}

(async () => {
  for (const bug of bugs) {
    await createBug(bug);
  }
})();