import { RequestHandler, Router, Request, Response } from 'express';
import { MCPToolCallValidationHandler } from '~/mcp/validation';
import { logger } from '@librechat/data-schemas';
import { FlowStateManager } from '~/flow/manager';

/**
 * Middleware function that ensures the user is authenticated and authorized to access a specific validation flow based on the validation ID.
 *
 * @param {Request<{ validationId: string }>} req - The request object containing the validation ID in the route parameters and the user object.
 * @param {Response} res - The response object used to send status codes and error messages.
 * @return {void} Does not return a value. Sends a 401 or 403 HTTP response if authentication or authorization fails.
 */
function validationIDUserGuard(
  req: Request<{ validationId: string }>,
  res: Response<{ error: string }>,
): void {
  // Get user object
  const user = req.user;
  logger.debug(
    `[MCP Validation] validationIDUserGuard called for ${req.params.validationId} and ${JSON.stringify(user, null, 2)}`,
  );

  // Ensure the user object has an id - otherwise the flow cannot be checked
  if (!user?.id) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  // Get the validationId from request parameters
  const { validationId } = req.params;

  // Allow only user-owned validation flows
  if (!validationId.startsWith(`${user.id}:`)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
}

export const createMcpRouter = ({
  getFlowStateManager,
  requireJwtAuth,
}: {
  getFlowStateManager: <FlowResult>() => FlowStateManager<FlowResult>;
  requireJwtAuth: RequestHandler;
}) => {
  /**
   * MCP router
   *
   * Create new mcp routes here and not in the legacy JavaScript file.
   *
   * @see /api/server/routes/mcp.ts - Legacy JavaScript MCP router implementation - extended by this module.
   */
  const router = Router();

  // All requests in this router need to be authenticated with a user object with an id
  router.use(requireJwtAuth);

  /**
   * Validate a tool call
   * This endpoint is called when the user confirms a tool call validation
   */
  router.post(
    '/validation/confirm/:validationId',
    validationIDUserGuard,
    async (
      req: Request<{ validationId: string }>,
      res: Response<{ error: string } | { success: true }>,
    ) => {
      try {
        const { validationId } = req.params;
        const flowManager = getFlowStateManager<boolean>();

        const flowState = await MCPToolCallValidationHandler.getFlowState(
          validationId,
          flowManager,
        );
        if (!flowState) {
          res.status(404).json({ error: 'Validation flow not found' });
          return;
        }

        // Complete the validation flow
        await MCPToolCallValidationHandler.completeValidationFlow(validationId, flowManager);
        logger.info(`[MCP Validation] Tool call validation confirmed for ${validationId}`);

        res.json({ success: true });
      } catch (error) {
        logger.error('[MCP Validation] Failed to confirm validation', error);
        res.status(500).json({ error: 'Failed to confirm validation' });
      }
    },
  );

  /**
   * Check validation flow status
   * This endpoint can be used to poll the status of a validation flow
   */
  router.get(
    '/validation/status/:validationId',
    validationIDUserGuard,
    async (req: Request<{ validationId: string }>, res: Response<{ error: string } | unknown>) => {
      try {
        const { validationId } = req.params;
        const flowManager = getFlowStateManager<boolean>();

        const flowState = await flowManager.getFlowState(validationId, 'mcp_tool_validation');
        if (!flowState) {
          res.status(404).json({ error: 'Validation flow not found' });
          return;
        }

        res.json({
          status: flowState.status,
          completed: flowState.status === 'COMPLETED',
          failed: flowState.status === 'FAILED',
          error: flowState.error,
        });
      } catch (error) {
        logger.error('[MCP Validation] Failed to get validation status', error);
        res.status(500).json({ error: 'Failed to get validation status' });
      }
    },
  );

  return router;
};
