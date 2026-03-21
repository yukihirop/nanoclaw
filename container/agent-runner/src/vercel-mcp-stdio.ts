/**
 * Vercel MCP Server for NanoClaw
 * Exposes Vercel deployment and project management as tools for the container agent.
 * Requires VERCEL_API_TOKEN environment variable.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const VERCEL_API_TOKEN = process.env.VERCEL_API_TOKEN || '';
const VERCEL_API_BASE = 'https://api.vercel.com';

function log(msg: string): void {
  console.error(`[VERCEL] ${msg}`);
}

async function vercelFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  if (!VERCEL_API_TOKEN) {
    throw new Error('VERCEL_API_TOKEN is not set');
  }
  const url = endpoint.startsWith('http') ? endpoint : `${VERCEL_API_BASE}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${VERCEL_API_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Vercel API error ${res.status}: ${body}`);
  }
  return body ? JSON.parse(body) : {};
}

const server = new McpServer({
  name: 'vercel',
  version: '1.0.0',
});

// List projects
server.tool(
  'vercel_list_projects',
  'List Vercel projects',
  { limit: z.number().optional().describe('Max projects to return (default 20)') },
  async ({ limit }) => {
    log('Listing projects');
    const data = await vercelFetch(`/v9/projects?limit=${limit || 20}`);
    const projects = data.projects.map((p: any) => ({
      name: p.name,
      id: p.id,
      framework: p.framework,
      url: p.targets?.production?.url || null,
    }));
    return { content: [{ type: 'text', text: JSON.stringify(projects, null, 2) }] };
  },
);

// Create project
server.tool(
  'vercel_create_project',
  'Create a new Vercel project',
  {
    name: z.string().describe('Project name'),
    framework: z.string().optional().describe('Framework preset (nextjs, vite, etc.)'),
  },
  async ({ name, framework }) => {
    log(`Creating project: ${name}`);
    const body: any = { name };
    if (framework) body.framework = framework;
    const data = await vercelFetch('/v10/projects', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ id: data.id, name: data.name, framework: data.framework }, null, 2),
      }],
    };
  },
);

// Deploy files
server.tool(
  'vercel_deploy',
  'Deploy files to Vercel. Pass an array of files with path and content. Returns the deployment URL.',
  {
    name: z.string().describe('Project name (will be created if it does not exist)'),
    files: z.array(z.object({
      file: z.string().describe('File path relative to project root (e.g. "index.html", "src/app.js")'),
      data: z.string().describe('File content as string'),
    })).describe('Array of files to deploy'),
    projectSettings: z.object({
      framework: z.string().optional().describe('Framework preset (nextjs, vite, static, etc.)'),
      buildCommand: z.string().optional().describe('Custom build command'),
      outputDirectory: z.string().optional().describe('Output directory for the build'),
    }).optional().describe('Project settings for the deployment'),
  },
  async ({ name, files, projectSettings }) => {
    log(`>>> Deploying ${files.length} files to project: ${name}`);

    const body: any = {
      name,
      files: files.map(f => ({
        file: f.file,
        data: f.data,
      })),
    };

    if (projectSettings) {
      body.projectSettings = {};
      if (projectSettings.framework) body.projectSettings.framework = projectSettings.framework;
      if (projectSettings.buildCommand) body.projectSettings.buildCommand = projectSettings.buildCommand;
      if (projectSettings.outputDirectory) body.projectSettings.outputDirectory = projectSettings.outputDirectory;
    }

    const data = await vercelFetch('/v13/deployments', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const url = data.url ? `https://${data.url}` : null;
    log(`<<< Deploy complete: ${url}`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          id: data.id,
          url,
          readyState: data.readyState,
          name: data.name,
        }, null, 2),
      }],
    };
  },
);

// List deployments
server.tool(
  'vercel_list_deployments',
  'List recent deployments',
  {
    projectId: z.string().optional().describe('Filter by project ID'),
    limit: z.number().optional().describe('Max deployments to return (default 10)'),
  },
  async ({ projectId, limit }) => {
    log('Listing deployments');
    let endpoint = `/v6/deployments?limit=${limit || 10}`;
    if (projectId) endpoint += `&projectId=${projectId}`;
    const data = await vercelFetch(endpoint);
    const deployments = data.deployments.map((d: any) => ({
      id: d.uid,
      url: d.url ? `https://${d.url}` : null,
      state: d.readyState || d.state,
      created: d.created,
      name: d.name,
    }));
    return { content: [{ type: 'text', text: JSON.stringify(deployments, null, 2) }] };
  },
);

// Get deployment
server.tool(
  'vercel_get_deployment',
  'Get details of a specific deployment',
  { deploymentId: z.string().describe('Deployment ID or URL') },
  async ({ deploymentId }) => {
    log(`Getting deployment: ${deploymentId}`);
    const data = await vercelFetch(`/v13/deployments/${deploymentId}`);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          id: data.id,
          url: data.url ? `https://${data.url}` : null,
          readyState: data.readyState,
          name: data.name,
          meta: data.meta,
        }, null, 2),
      }],
    };
  },
);

// Delete project
server.tool(
  'vercel_delete_project',
  'Delete a Vercel project',
  { projectId: z.string().describe('Project ID or name to delete') },
  async ({ projectId }) => {
    log(`Deleting project: ${projectId}`);
    await vercelFetch(`/v9/projects/${projectId}`, { method: 'DELETE' });
    return { content: [{ type: 'text', text: `Project ${projectId} deleted.` }] };
  },
);

async function main(): Promise<void> {
  if (!VERCEL_API_TOKEN) {
    log('WARNING: VERCEL_API_TOKEN not set. Tools will fail.');
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('Vercel MCP server started');
}

main().catch((err) => {
  log(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
