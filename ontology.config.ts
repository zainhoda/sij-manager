import { defineOntology } from 'ont-run';
import { z } from 'zod';

export default defineOntology({
  name: 'my-api',

  environments: {
    dev: { debug: true },
    prod: { debug: false },
  },

  // Pluggable auth - customize this for your use case
  auth: async (req) => {
    const token = req.headers.get('Authorization');
    // Return access groups based on auth
    // This is where you'd verify JWTs, API keys, etc.
    if (!token) return ['public'];
    if (token === 'admin-secret') return ['admin', 'support', 'public'];
    return ['support', 'public'];
  },

  accessGroups: {
    public: { description: 'Unauthenticated users' },
    support: { description: 'Support agents' },
    admin: { description: 'Administrators' },
  },

  functions: {
    // Example: Public function
    healthCheck: {
      description: 'Check API health status',
      access: ['public', 'support', 'admin'],
      inputs: z.object({}),
      resolver: './resolvers/healthCheck.ts',
    },

    // Example: Restricted function
    getUser: {
      description: 'Get user details by ID',
      access: ['support', 'admin'],
      inputs: z.object({
        userId: z.string().uuid(),
      }),
      resolver: './resolvers/getUser.ts',
    },

    // Example: Admin-only function
    deleteUser: {
      description: 'Delete a user account',
      access: ['admin'],
      inputs: z.object({
        userId: z.string().uuid(),
        reason: z.string().optional(),
      }),
      resolver: './resolvers/deleteUser.ts',
    },
  },
});
