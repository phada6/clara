/**
 * Flowise Service
 * Handles integration with Flowise API endpoints for chat functionality
 */

import type { ChatMessage } from '../utils/APIClient';
import type { ClaraMessage, ClaraFileAttachment } from '../types/clara_assistant_types';

export interface FlowiseConfig {
  endpoint: string;
  apiKey?: string;
}

export interface FlowiseResponse {
  text: string;
  question: string;
  chatId?: string;
  chatMessageId?: string;
  isStreamValid?: boolean;
  sessionId?: string;
}

export class FlowiseService {
  private config: FlowiseConfig;

  constructor(config: FlowiseConfig) {
    this.config = config;
  }

  /**
   * Send a chat message to Flowise endpoint
   */
  public async sendChat(
    message: string,
    attachments: ClaraFileAttachment[],
    conversationHistory?: ClaraMessage[],
    onContentChunk?: (content: string) => void
  ): Promise<ClaraMessage> {
    try {
      // Build the payload for Flowise
      const payload = {
        question: message,
        history: this.buildFlowiseHistory(conversationHistory),
        ...(attachments.length > 0 && { images: this.extractImages(attachments) })
      };

      console.log(`💬 Sending message to Flowise: ${message.substring(0, 100)}...`);

      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Flowise API error: ${response.status} ${response.statusText}`);
      }

      const flowiseResponse: FlowiseResponse = await response.json();
      
      // Create Clara message from Flowise response
      const claraMessage: ClaraMessage = {
        id: flowiseResponse.chatMessageId || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: flowiseResponse.text || 'No response received',
        timestamp: new Date(),
        metadata: {
          model: 'flowise',
          provider: 'flowise',
          sessionId: flowiseResponse.sessionId,
          chatId: flowiseResponse.chatId
        }
      };

      // Send content chunk if callback provided
      if (onContentChunk && flowiseResponse.text) {
        onContentChunk(flowiseResponse.text);
      }

      return claraMessage;

    } catch (error) {
      console.error('Flowise chat error:', error);
      
      // Return error message as Clara message
      return {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: `Error communicating with Flowise: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
        metadata: {
          model: 'flowise',
          provider: 'flowise',
          error: true
        }
      };
    }
  }

  /**
   * Stream chat response from Flowise endpoint
   */
  public async *streamChat(
    message: string,
    attachments: ClaraFileAttachment[],
    conversationHistory?: ClaraMessage[],
    onContentChunk?: (content: string) => void
  ): AsyncGenerator<string> {
    try {
      const payload = {
        question: message,
        history: this.buildFlowiseHistory(conversationHistory),
        ...(attachments.length > 0 && { images: this.extractImages(attachments) })
      };

      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Flowise API error: ${response.status} ${response.statusText}`);
      }

      // For non-streaming endpoints, yield the entire response
      const flowiseResponse: FlowiseResponse = await response.json();
      
      if (flowiseResponse.text) {
        yield flowiseResponse.text;
        if (onContentChunk) {
          onContentChunk(flowiseResponse.text);
        }
      }

    } catch (error) {
      console.error('Flowise streaming error:', error);
      const errorMessage = `Error communicating with Flowise: ${error instanceof Error ? error.message : 'Unknown error'}`;
      yield errorMessage;
      if (onContentChunk) {
        onContentChunk(errorMessage);
      }
    }
  }

  /**
   * Build conversation history for Flowise
   */
  private buildFlowiseHistory(conversationHistory?: ClaraMessage[]): Array<{
    human: string;
    ai: string;
  }> {
    if (!conversationHistory || conversationHistory.length === 0) {
      return [];
    }

    const history: Array<{ human: string; ai: string }> = [];
    let currentHumanMessage = '';

    for (const message of conversationHistory) {
      if (message.role === 'user') {
        currentHumanMessage = message.content;
      } else if (message.role === 'assistant' && currentHumanMessage) {
        history.push({
          human: currentHumanMessage,
          ai: message.content
        });
        currentHumanMessage = '';
      }
    }

    return history.slice(-10); // Keep last 10 exchanges
  }

  /**
   * Extract images from attachments
   */
  private extractImages(attachments: ClaraFileAttachment[]): string[] {
    return attachments
      .filter(att => att.type === 'image')
      .map(att => att.base64 || att.url || '')
      .filter(url => url.length > 0);
  }

  /**
   * Test connection to Flowise endpoint
   */
  public async testConnection(): Promise<boolean> {
    try {
      const testPayload = {
        question: "test connection"
      };

      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
        },
        body: JSON.stringify(testPayload)
      });

      return response.ok;
    } catch (error) {
      console.error('Flowise connection test failed:', error);
      return false;
    }
  }

  /**
   * Update Flowise configuration
   */
  public updateConfig(config: FlowiseConfig): void {
    this.config = config;
  }
}

// Export singleton instance
export const flowiseService = new FlowiseService({
  endpoint: 'https://q0z0ngxj.rpcl.host/api/v1/prediction/b3eeb67d-6d20-4555-93a6-a89b99f95d2c'
});
