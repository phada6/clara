/**
 * Clara Chat Service
 * Handles basic chat functionality, streaming, and message building
 */

import { AssistantAPIClient } from '../utils/AssistantAPIClient';
import type { ChatMessage } from '../utils/APIClient';
import { 
  ClaraMessage, 
  ClaraFileAttachment, 
  ClaraAIConfig
} from '../types/clara_assistant_types';
import type { Tool } from '../db';
import { claraToolService } from './claraToolService';

export class ClaraChatService {
  /**
   * Execute standard chat workflow
   */
  public async executeStandardChat(
    client: AssistantAPIClient,
    modelId: string,
    message: string,
    tools: Tool[],
    config: ClaraAIConfig,
    attachments: ClaraFileAttachment[],
    systemPrompt?: string,
    conversationHistory?: ClaraMessage[],
    onContentChunk?: (content: string) => void,
    currentProviderId?: string,
    shouldDisableStreamingForTools?: boolean
  ): Promise<ClaraMessage> {
    const options = {
      temperature: config.parameters.temperature,
      max_tokens: config.parameters.maxTokens,
      top_p: config.parameters.topP
    };

    let responseContent = '';
    let totalTokens = 0;
    let toolResults: any[] = [];
    let finalUsage: any = {};
    let finalTimings: any = {};

    // Build conversation messages
    const messages = this.buildConversationMessages(
      systemPrompt || 'You are Clara, a helpful AI assistant.',
      message,
      attachments,
      conversationHistory
    );

    console.log(`💬 Starting chat execution with ${messages.length} messages and ${tools.length} tools`);

    try {
      let response;

      // Try streaming first if enabled
      if (config.features.enableStreaming) {
        // Check if we should disable streaming for this provider when tools are present
        if (shouldDisableStreamingForTools) {
          console.log(`🔄 Disabling streaming for provider with tools present`);
          if (onContentChunk) {
            onContentChunk('⚠️ Switching to non-streaming mode for better tool support with this provider...\n\n');
          }
          // Use non-streaming mode
          response = await client.sendChat(modelId, messages, options, tools);
          responseContent = response.message?.content || '';
          totalTokens = response.usage?.total_tokens || 0;
          finalUsage = response.usage || {};
          finalTimings = response.timings || {};
          
          if (onContentChunk && responseContent) {
            onContentChunk(responseContent);
          }
        } else {
          // Use streaming mode
          try {
            const collectedToolCalls: any[] = [];
            let streamContent = '';

            for await (const chunk of client.streamChat(modelId, messages, options, tools)) {
              if (chunk.message?.content) {
                streamContent += chunk.message.content;
                responseContent += chunk.message.content;
                if (onContentChunk) {
                  onContentChunk(chunk.message.content);
                }
              }

              // Collect tool calls
              if (chunk.message?.tool_calls) {
                for (const toolCall of chunk.message.tool_calls) {
                  if (!toolCall.id && !toolCall.function?.name) {
                    continue;
                  }
                  
                  let existingCall = collectedToolCalls.find(c => c.id === toolCall.id);
                  if (!existingCall) {
                    existingCall = {
                      id: toolCall.id || `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                      type: toolCall.type || 'function',
                      function: { name: '', arguments: '' }
                    };
                    collectedToolCalls.push(existingCall);
                  }
                  
                  if (toolCall.function?.name) {
                    existingCall.function.name = toolCall.function.name;
                  }
                  
                  if (toolCall.function?.arguments) {
                    existingCall.function.arguments += toolCall.function.arguments;
                  }
                }
              }

              if (chunk.usage?.total_tokens) {
                totalTokens = chunk.usage.total_tokens;
                finalUsage = chunk.usage;
              }
              if (chunk.timings) {
                finalTimings = chunk.timings;
              }
            }

            response = {
              message: {
                content: streamContent,
                tool_calls: collectedToolCalls.length > 0 ? collectedToolCalls : undefined
              },
              usage: { total_tokens: totalTokens }
            };

            // Filter out incomplete tool calls
            if (response.message?.tool_calls) {
              response.message.tool_calls = response.message.tool_calls.filter(toolCall => {
                if (!toolCall.function?.name || toolCall.function.name.trim() === '') {
                  return false;
                }
                
                if (typeof toolCall.function.arguments !== 'string') {
                  return false;
                }
                
                try {
                  JSON.parse(toolCall.function.arguments || '{}');
                  return true;
                } catch (parseError) {
                  return false;
                }
              });
              
              if (response.message.tool_calls.length === 0) {
                response.message.tool_calls = undefined;
              }
            }

          } catch (streamError: any) {
            const errorMessage = streamError.message?.toLowerCase() || '';
            if (errorMessage.includes('stream') && errorMessage.includes('tool') && tools.length > 0) {
              if (onContentChunk) {
                onContentChunk('\n⚠️ Switching to non-streaming mode for tool support...\n\n');
              }
              response = await client.sendChat(modelId, messages, options, tools);
              responseContent = response.message?.content || '';
              totalTokens = response.usage?.total_tokens || 0;
              finalUsage = response.usage || {};
              finalTimings = response.timings || {};
              
              if (onContentChunk && responseContent) {
                onContentChunk(responseContent);
              }
            } else {
              throw streamError;
            }
          }
        }
      } else {
        // Non-streaming mode
        response = await client.sendChat(modelId, messages, options, tools);
        responseContent = response.message?.content || '';
        totalTokens = response.usage?.total_tokens || 0;
        finalUsage = response.usage || {};
        finalTimings = response.timings || {};
        
        if (onContentChunk && responseContent) {
          onContentChunk(responseContent);
        }
      }

      // Handle tool calls if any
      if (response.message?.tool_calls && response.message.tool_calls.length > 0) {
        if (onContentChunk) {
          onContentChunk('\n\n🔧 **Executing tools...**\n\n');
        }

        toolResults = await claraToolService.executeToolCalls(response.message.tool_calls, currentProviderId);

        if (onContentChunk) {
          onContentChunk('✅ **Tools executed**\n\n');
        }

        // After tool execution, make a follow-up request to process the results
        if (toolResults.length > 0) {
          const followUpMessages = [...messages];
          
          // Add the assistant's message with tool calls
          followUpMessages.push({
            role: 'assistant',
            content: response.message.content || '',
            tool_calls: response.message.tool_calls
          });
          
          // Add tool results
          for (const toolCall of response.message.tool_calls) {
            const result = toolResults.find(r => r.toolName === toolCall.function?.name);
            
            if (result) {
              let content: string;
              if (result.success && result.result !== undefined && result.result !== null) {
                content = typeof result.result === 'string' ? result.result : JSON.stringify(result.result);
              } else {
                content = result.error || `Tool ${result.toolName} execution failed`;
              }
              
              followUpMessages.push({
                role: 'tool',
                content: content,
                name: result.toolName,
                tool_call_id: toolCall.id
              });
            } else {
              followUpMessages.push({
                role: 'tool',
                content: `Tool execution failed: No result returned for ${toolCall.function?.name || 'unknown tool'}`,
                name: toolCall.function?.name || 'unknown_tool',
                tool_call_id: toolCall.id
              });
            }
          }

          // Make follow-up request
          try {
            const followUpResponse = await client.sendChat(modelId, followUpMessages, options);
            const followUpContent = followUpResponse.message?.content || '';
            
            if (followUpContent) {
              responseContent += followUpContent;
              totalTokens += followUpResponse.usage?.total_tokens || 0;
              
              if (onContentChunk) {
                onContentChunk(followUpContent);
              }
            }
          } catch (followUpError) {
            console.error('❌ Follow-up request failed:', followUpError);
            if (onContentChunk) {
              onContentChunk('\n⚠️ Failed to process tool results, but tools were executed successfully.\n');
            }
          }
        }
      }

    } catch (error) {
      console.error('Standard chat execution failed:', error);
      responseContent = 'I apologize, but I encountered an error while processing your request. Please try again.';
    }

    // Create final Clara message
    const claraMessage: ClaraMessage = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'assistant',
      content: responseContent || 'I apologize, but I was unable to generate a response.',
      timestamp: new Date(),
      metadata: {
        model: `${config.provider}:${modelId}`,
        tokens: totalTokens,
        usage: finalUsage,
        timings: finalTimings,
        temperature: config.parameters.temperature,
        toolsUsed: toolResults.map(tc => tc.toolName),
        autonomousMode: false
      }
    };

    // Add artifacts if any were generated from tool calls
    if (toolResults.length > 0) {
      claraMessage.artifacts = claraToolService.parseToolResultsToArtifacts(toolResults);
    }

    return claraMessage;
  }

  /**
   * Build conversation messages for API call
   */
  public buildConversationMessages(
    systemPrompt: string,
    userMessage: string,
    attachments: ClaraFileAttachment[],
    conversationHistory?: ClaraMessage[]
  ): ChatMessage[] {
    const messages: ChatMessage[] = [];
    
    // Add system prompt
    messages.push({
      role: 'system',
      content: systemPrompt
    });

    // Add conversation history if provided
    if (conversationHistory && conversationHistory.length > 0) {
      const historyMessages = conversationHistory.slice(0, -1);
      for (const historyMessage of historyMessages) {
        const chatMessage: ChatMessage = {
          role: historyMessage.role,
          content: historyMessage.content
        };

        if (historyMessage.attachments) {
          const imageAttachments = historyMessage.attachments.filter(att => att.type === 'image');
          if (imageAttachments.length > 0) {
            chatMessage.images = imageAttachments.map(att => att.base64 || att.url || '');
          }
        }

        messages.push(chatMessage);
      }
      console.log(`📚 Added ${conversationHistory.length - 1} history messages to chat context`);
    }

    // Add the current user message
    const userChatMessage: ChatMessage = {
      role: 'user',
      content: userMessage
    };

    // Add images if any attachments are images
    const imageAttachments = attachments.filter(att => att.type === 'image');
    if (imageAttachments.length > 0) {
      userChatMessage.images = imageAttachments.map(att => att.base64 || att.url || '');
    }

    messages.push(userChatMessage);

    return messages;
  }

  /**
   * Preload/warm up a model
   */
  public async preloadModel(
    client: AssistantAPIClient,
    modelId: string,
    config: ClaraAIConfig,
    isLocalProvider: boolean
  ): Promise<void> {
    if (!client || !modelId) {
      return;
    }

    // Only preload for local providers
    if (!isLocalProvider) {
      return;
    }

    try {
      const warmupMessages = [
        { role: 'system' as const, content: 'You are Clara, a helpful AI assistant.' },
        { role: 'user' as const, content: 'Hi' }
      ];

      const warmupOptions = {
        temperature: 0.1,
        max_tokens: 1,
        stream: false
      };

      client.sendChat(modelId, warmupMessages, warmupOptions).catch(() => {
        // Silently handle errors
      });
    } catch (error) {
      // Silently handle preload errors
    }
  }
}

// Export singleton instance
export const claraChatService = new ClaraChatService(); 