import { randomBytes } from 'crypto';
import { logger } from '@librechat/data-schemas';
import type { FlowStateManager } from '~/flow/manager';
import type { FlowMetadata } from '~/flow/types';

/**
 * Handler for MCP tool call validation
 */
export class MCPToolCallValidationHandler {
  private static readonly FLOW_TYPE = 'mcp_tool_validation';
  private static readonly FLOW_TTL = 10 * 60 * 1000; // 10 minutes

  /**
   * Initiates the tool call validation flow
   */
  static async initiateValidationFlow(
    userId: string,
    serverName: string,
    toolName: string,
    toolArguments: Record<string, unknown>,
  ): Promise<{ validationId: string; flowMetadata: FlowMetadata }> {
    logger.debug(`[MCPValidation] initiateValidationFlow called for ${serverName}/${toolName}`);

    const validationId = this.generateValidationId(userId, serverName, toolName);
    const state = this.generateState();

    logger.debug(`[MCPValidation] Generated validationId: ${validationId}, state: ${state}`);

    const flowMetadata: FlowMetadata = {
      userId,
      serverName,
      toolName,
      toolArguments,
      state,
      timestamp: Date.now(),
    };

    return {
      validationId,
      flowMetadata,
    };
  }

  /**
   * Completes the tool call validation flow
   */
  static async completeValidationFlow(
    validationId: string,
    flowManager: FlowStateManager<boolean>,
  ): Promise<boolean> {
    try {
      const flowState = await flowManager.getFlowState(validationId, this.FLOW_TYPE);
      if (!flowState) {
        throw new Error('Validation flow not found');
      }

      // Mark the flow as complete with a successful result
      await flowManager.completeFlow(validationId, this.FLOW_TYPE, true);
      return true;
    } catch (error) {
      logger.error('[MCPValidation] Failed to complete validation flow', { error, validationId });
      await flowManager.failFlow(validationId, this.FLOW_TYPE, error as Error);
      throw error;
    }
  }

  /**
   * Gets the validation flow state
   */
  static async getFlowState(
    validationId: string,
    flowManager: FlowStateManager<boolean>,
  ): Promise<FlowMetadata | null> {
    const flowState = await flowManager.getFlowState(validationId, this.FLOW_TYPE);
    if (!flowState) {
      return null;
    }
    return flowState.metadata as FlowMetadata;
  }

  /**
   * Generates a validation ID for the tool call validation flow
   */
  public static generateValidationId(userId: string, serverName: string, toolName: string): string {
    return `${userId}:${serverName}:${toolName}:${Date.now()}`;
  }

  /**
   * Generates a secure state parameter
   */
  private static generateState(): string {
    return randomBytes(32).toString('base64url');
  }
}