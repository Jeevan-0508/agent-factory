const COUNCIL_NAME = 'OLYMPUS ENGINEERING COUNCIL';

const MEMBERS = [
  ['solution_architect', 'Architecture'],
  ['backend_engineer', 'Engineering'],
  ['frontend_engineer', 'Engineering'],
  ['security_engineer', 'Security & Risk'],
  ['risk_manager', 'Security & Risk'],
  ['ai_governance_manager', 'Governance'],
  ['qa_test_engineer', 'Quality & Security'],
  ['performance_engineer', 'Quality & Security'],
  ['documentation_writer', 'Documentation'],
  ['release_manager', 'Release']
];

export function createEngineeringCouncil({ olympus }) {
  function ensure({ workspaceId, actorId }) {
    let organization = olympus.listOrganizations(workspaceId).find((item) => item.name === COUNCIL_NAME);
    if (!organization) {
      organization = olympus.createOrganization({ workspaceId, actorId, name: COUNCIL_NAME, templateId: 'software-engineering-company', objective: 'Develop AGENT//FACTORY through evidence-constrained, reviewable engineering.' });
    } else {
      organization = olympus.getOrganization(workspaceId, organization.id);
    }

    const departments = new Map(organization.departments.map((item) => [item.name, item]));
    for (const name of ['Architecture', 'Security & Risk', 'Governance', 'Documentation', 'Release']) {
      if (!departments.has(name)) {
        const created = olympus.createDepartment({ workspaceId, actorId, organizationId: organization.id, name, objective: `${name} responsibilities for the Engineering Council.` });
        departments.set(name, created);
      }
    }
    const existing = new Set(organization.members.map((item) => item.agent_id));
    const architectId = 'solution_architect';
    for (const [agentId, departmentName] of MEMBERS) {
      if (existing.has(agentId)) continue;
      olympus.recruitMember({ workspaceId, actorId, organizationId: organization.id, agentId, departmentId: departments.get(departmentName)?.id || null, reportsTo: agentId === architectId ? null : architectId, capabilities: ['engineering-council-review'] });
    }
    const result = olympus.getOrganization(workspaceId, organization.id);
    return { ...result, coordinator: 'Codex', coordinator_note: 'Codex is the coordinating architect for this local workflow; it is not a catalog member or an automatic approval authority.', council_workflow: ['DISCOVER', 'PLAN', 'CHALLENGE', 'APPROVE', 'IMPLEMENT', 'TEST', 'REVIEW', 'REPAIR', 'VERIFY', 'RELEASE'] };
  }

  return { name: COUNCIL_NAME, members: MEMBERS.map(([agentId, department]) => ({ agent_id: agentId, department })), ensure };
}
