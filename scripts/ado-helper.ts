import axios from "axios";

const org = process.env.ADO_ORG!;
const project = process.env.ADO_PROJECT!;
const pat = process.env.ADO_PAT!;

const auth = Buffer.from(`:${pat}`).toString("base64");

export async function findDuplicateBug(title: string) {
  const url = `https://dev.azure.com/${org}/${project}/_apis/wit/wiql?api-version=7.1`;

  const query = {
    query: `
SELECT [System.Id]
FROM WorkItems
WHERE
[System.WorkItemType] = 'Bug'
AND
[System.Title] = '[Candidate Bug] ${title}'
AND
[System.State] <> 'Closed'
`,
  };

  const response = await axios.post(url, query, {
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
  });

  return response.data.workItems || [];
}
