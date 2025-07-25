import React, { useState, useEffect, useRef } from 'react';
import { Bot, Terminal, X, FileText, Image, Calculator, Upload } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { agentWorkflowStorage } from '../services/agentWorkflowStorage';

// Import Clara Flow SDK
import { ClaraFlowRunner } from '../../sdk/src/ClaraFlowRunner';

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface InputValue {
  nodeId: string;
  nodeName: string;
  value: string | File | null;
  type: 'text' | 'file' | 'number';
}

interface AgentRunnerProps {
  agentId: string;
  onClose: () => void;
}

interface SDKExecutionLog {
  id: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  timestamp: string;
  nodeId?: string;
  nodeName?: string;
  duration?: number;
  data?: any;
}

const formatMessage = (content: string) => {
  return (
    <ReactMarkdown
      className="prose prose-sm max-w-none dark:prose-invert"
      components={{
        p: ({ children }) => <p className="text-gray-900 dark:text-gray-100 mb-2 last:mb-0">{children}</p>,
        h1: ({ children }) => <h1 className="text-gray-900 dark:text-gray-100 text-lg font-bold mb-2">{children}</h1>,
        h2: ({ children }) => <h2 className="text-gray-900 dark:text-gray-100 text-base font-bold mb-2">{children}</h2>,
        h3: ({ children }) => <h3 className="text-gray-900 dark:text-gray-100 text-sm font-bold mb-1">{children}</h3>,
        ul: ({ children }) => <ul className="text-gray-900 dark:text-gray-100 list-disc list-inside mb-2 space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="text-gray-900 dark:text-gray-100 list-decimal list-inside mb-2 space-y-1">{children}</ol>,
        li: ({ children }) => <li className="text-gray-900 dark:text-gray-100">{children}</li>,
        strong: ({ children }) => <strong className="text-gray-900 dark:text-gray-100 font-semibold">{children}</strong>,
        em: ({ children }) => <em className="text-gray-900 dark:text-gray-100 italic">{children}</em>,
        code: ({ children }) => (
          <code className="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-1 py-0.5 rounded text-xs font-mono">
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 p-3 rounded-lg overflow-x-auto text-xs font-mono mb-2">
            {children}
          </pre>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
};

const AgentRunnerSDK: React.FC<AgentRunnerProps> = ({ agentId, onClose }) => {
  // State management - completely independent from AgentBuilderContext
  const [agentFlow, setAgentFlow] = useState<any>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValues, setInputValues] = useState<InputValue[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [agentLoading, setAgentLoading] = useState(true);
  const [showLogs, setShowLogs] = useState(false);
  const [executionLogs, setExecutionLogs] = useState<SDKExecutionLog[]>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load the agent workflow on component mount
  useEffect(() => {
    const loadAgent = async () => {
      try {
        setAgentLoading(true);
        console.log('🔄 Loading agent workflow:', agentId);
        
        const agent = await agentWorkflowStorage.getWorkflow(agentId);
        if (agent) {
          console.log('✅ Agent loaded successfully:', agent);
          setAgentFlow(agent);
          
          // Extract input nodes for UI
          const inputNodes = agent.nodes.filter((node: any) => 
            node.type === 'input' || 
            node.type === 'image-input' || 
            node.type === 'pdf-input' || 
            node.type === 'file-upload'
          );
          
          console.log('📥 Found input nodes:', inputNodes);
          
          // Initialize input values
          const initialValues = inputNodes.map((node: any) => ({
            nodeId: node.id,
            nodeName: node.name || `Input ${node.id}`,
            value: '',
            type: getInputTypeFromNodeType(node.type)
          }));
          
          setInputValues(initialValues);
        } else {
          console.error('❌ Agent not found:', agentId);
        }
      } catch (error) {
        console.error('❌ Failed to load agent:', error);
      } finally {
        setAgentLoading(false);
      }
    };

    if (agentId) {
      loadAgent();
    }
  }, [agentId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const getInputTypeFromNodeType = (nodeType: string): 'text' | 'file' | 'number' => {
    if (nodeType.includes('image') || nodeType.includes('pdf') || nodeType.includes('file')) {
      return 'file';
    }
    if (nodeType.includes('number')) {
      return 'number';
    }
    return 'text';
  };

  const convertToSDKFormat = (agentFlow: any): any => {
    // Convert AgentBuilder format to Clara Flow SDK format
    return {
      format: 'clara-sdk',
      version: '1.0.0',
      flow: {
        id: agentFlow.id,
        name: agentFlow.name,
        description: agentFlow.description,
        nodes: agentFlow.nodes,
        connections: agentFlow.connections || []
      },
      customNodes: []
    };
  };

  const handleInputChange = (nodeId: string, value: string | File) => {
    setInputValues(prev => prev.map(iv => 
      iv.nodeId === nodeId ? { ...iv, value } : iv
    ));
  };

  const handleRunAgent = async () => {
    if (!agentFlow || isLoading) return;

    setIsLoading(true);
    setExecutionLogs([]); // Clear previous logs
    setMessages([]); // Clear previous messages

    console.log('🚀 STARTING AGENT EXECUTION - Clara Flow SDK Approach');
    console.log('📋 Agent Flow:', agentFlow);
    console.log('📥 Input Values:', inputValues);

    try {
      // 🆕 Create Clara Flow SDK Runner - completely isolated
      const runner = new ClaraFlowRunner({
        enableLogging: true,
        timeout: 30000
      });

      console.log('✅ Clara Flow SDK Runner created');

      // Convert agent flow to SDK format
      const sdkFlowData = convertToSDKFormat(agentFlow);
      console.log('🔄 Converted to SDK format:', sdkFlowData);

      // Prepare inputs for SDK execution
      const sdkInputs: Record<string, any> = {};
      
      for (const inputValue of inputValues) {
        if (inputValue.value) {
          if (inputValue.type === 'file' && inputValue.value instanceof File) {
            // Handle file inputs
            const file = inputValue.value;
            let processedContent: string;
            
            if (file.type.startsWith('image/')) {
              // Convert image to base64
              processedContent = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.readAsDataURL(file);
              });
            } else if (file.type === 'application/pdf') {
              // Convert PDF to base64
              processedContent = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.readAsDataURL(file);
              });
            } else {
              // Read text files as text
              processedContent = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.readAsText(file);
              });
            }
            
            sdkInputs[inputValue.nodeName] = processedContent;
          } else {
            // Handle text/number inputs
            sdkInputs[inputValue.nodeName] = inputValue.value;
          }
        }
      }

      console.log('📤 SDK Inputs prepared:', sdkInputs);

      // 🎯 Execute using Clara Flow SDK - COMPLETELY ISOLATED
      console.log('⚡ Executing flow with Clara Flow SDK...');
      const executionResult = await runner.executeFlow(sdkFlowData, sdkInputs);
      
      console.log('🎉 SDK Execution completed!');
      console.log('📊 Raw SDK Results:', executionResult);

      // Extract results from SDK output
      const outputNodes = agentFlow.nodes.filter((node: any) => node.type === 'output');
      console.log('📤 Output nodes found:', outputNodes);

      let responseContent = '';
      
      if (Object.keys(executionResult).length === 0) {
        responseContent = '✅ **Execution Complete!**\n\nNo output results generated. Make sure your workflow has output nodes connected to the data flow.';
      } else {
        // Process SDK results
        const outputResults: Array<{label: string, content: string}> = [];
        
        for (const outputNode of outputNodes) {
          const nodeResult = executionResult[outputNode.id];
          
          if (nodeResult !== undefined && nodeResult !== null) {
            let processedContent = '';
            
            // Process the result based on its type
            if (typeof nodeResult === 'object') {
              // Try to unwrap common result formats
              if (nodeResult.output !== undefined) {
                processedContent = String(nodeResult.output);
              } else if (nodeResult.result !== undefined) {
                processedContent = String(nodeResult.result);
              } else if (nodeResult.text !== undefined) {
                processedContent = String(nodeResult.text);
              } else if (nodeResult.content !== undefined) {
                processedContent = String(nodeResult.content);
              } else if (nodeResult.value !== undefined) {
                processedContent = String(nodeResult.value);
              } else {
                // Display as JSON if it's a complex object
                processedContent = `\`\`\`json\n${JSON.stringify(nodeResult, null, 2)}\n\`\`\``;
              }
            } else {
              // Simple value - use as string
              processedContent = String(nodeResult);
            }
            
            if (processedContent.trim()) {
              outputResults.push({
                label: outputNode.name || `Output ${outputNode.id}`,
                content: processedContent
              });
            }
          }
        }
        
        // Format response
        if (outputResults.length === 0) {
          responseContent = '✅ **Execution Complete!**\n\nFlow execution completed but no output results found.';
        } else if (outputResults.length === 1) {
          // Single output - just show the content
          responseContent = `✅ **Execution Complete!**\n\n${outputResults[0].content}`;
        } else {
          // Multiple outputs - show with labels
          responseContent = '✅ **Execution Complete!**\n\n' + outputResults
            .map(result => `**${result.label}:**\n${result.content}`)
            .join('\n\n---\n\n');
        }
      }

      console.log('🎯 Final Response Content:', responseContent);

      // Create user message
      const userMessage: ChatMessage = {
        id: Date.now() + '_user',
        type: 'user',
        content: `Running agent with ${inputValues.filter(iv => iv.value).length} input(s)`,
        timestamp: new Date().toISOString()
      };

      // Create assistant message with results
      const assistantMessage: ChatMessage = {
        id: Date.now() + '_assistant',
        type: 'assistant',
        content: responseContent,
        timestamp: new Date().toISOString()
      };

      setMessages([userMessage, assistantMessage]);
      
      // Get execution logs from SDK
      const sdkLogs = runner.getLogs();
      console.log('📝 Final SDK logs:', sdkLogs);
      
      // Convert SDK logs to our format
      const convertedLogs = sdkLogs.map((log: any) => ({
        id: `${Date.now()}-${Math.random()}`,
        level: log.level || 'info',
        message: log.message,
        timestamp: log.timestamp || new Date().toISOString(),
        nodeId: log.nodeId,
        nodeName: log.nodeName,
        duration: log.duration,
        data: log.data
      }));
      
      setExecutionLogs(convertedLogs);
      
    } catch (error) {
      console.error('❌ Clara Flow SDK execution failed:', error);
      
      const errorMessage: ChatMessage = {
        id: Date.now() + '_error',
        type: 'assistant',
        content: `❌ **Execution Failed**\n\n${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString()
      };
      
      setMessages([errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearInputs = () => {
    setInputValues(prev => prev.map(input => ({ ...input, value: '' })));
  };

  const hasAllInputs = inputValues.length === 0 || inputValues.every(input => input.value !== '' && input.value !== null);

  if (agentLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading agent...</p>
        </div>
      </div>
    );
  }

  if (!agentFlow) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400">Agent not found</p>
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              {agentFlow.name}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {agentFlow.description || 'AI Agent Ready to Execute'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full">
              ✨ Clara Flow SDK
            </span>
            <button
              onClick={() => setShowLogs(!showLogs)}
              className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                showLogs
                  ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <Terminal className="w-4 h-4" />
              {showLogs ? 'Hide Logs' : 'Show Logs'}
              {executionLogs.length > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${
                  showLogs ? 'bg-blue-400 text-blue-50' : 'bg-red-500 text-white'
                }`}>
                  {executionLogs.length}
                </span>
              )}
            </button>
            <button onClick={onClose} className="p-2 text-gray-400">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Execution Logs Panel */}
        {showLogs && (
          <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Clara Flow SDK Logs</h4>
              <span className="text-xs text-gray-500 dark:text-gray-400">{executionLogs.length} entries</span>
            </div>
            {executionLogs.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 italic">No logs yet. Run your agent to see execution details.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {executionLogs.map((log) => (
                  <div key={log.id} className={`p-2 rounded text-xs font-mono ${
                    log.level === 'error' 
                      ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                      : log.level === 'warning'
                      ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800'
                      : log.level === 'success'
                      ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
                      : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                  }`}>
                    <div className="flex items-start gap-2">
                      <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="flex-1">{log.message}</span>
                    </div>
                    {log.data && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100">
                          Details
                        </summary>
                        <pre className="mt-1 text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto">
                          {JSON.stringify(log.data, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Input Panel */}
        <div className="w-1/3 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">Agent Inputs</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Configure the inputs for your agent execution
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {inputValues.length === 0 ? (
              <div className="text-center py-8">
                <Calculator className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">No inputs required</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  This agent runs without input parameters
                </p>
              </div>
            ) : (
              inputValues.map((input) => (
                <div key={input.nodeId} className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {input.nodeName}
                  </label>
                  
                  {input.type === 'file' ? (
                    <div className="space-y-2">
                      <input
                        type="file"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handleInputChange(input.nodeId, file);
                          }
                        }}
                        className="block w-full text-sm text-gray-500 dark:text-gray-400
                          file:mr-4 file:py-2 file:px-4
                          file:rounded-lg file:border-0
                          file:text-sm file:font-medium
                          file:bg-indigo-50 file:text-indigo-700
                          dark:file:bg-indigo-900/30 dark:file:text-indigo-300
                          hover:file:bg-indigo-100 dark:hover:file:bg-indigo-900/50
                          file:cursor-pointer"
                        accept={
                          input.nodeName.toLowerCase().includes('image') ? 'image/*' :
                          input.nodeName.toLowerCase().includes('pdf') ? '.pdf' :
                          '*/*'
                        }
                      />
                      {input.value && input.value instanceof File && (
                        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                          {input.value.type.startsWith('image/') ? (
                            <Image className="w-4 h-4" />
                          ) : input.value.type === 'application/pdf' ? (
                            <FileText className="w-4 h-4" />
                          ) : (
                            <Upload className="w-4 h-4" />
                          )}
                          <span>{input.value.name}</span>
                          <span>({(input.value.size / 1024).toFixed(1)} KB)</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <input
                      type={input.type === 'number' ? 'number' : 'text'}
                      value={input.value as string || ''}
                      onChange={(e) => handleInputChange(input.nodeId, e.target.value)}
                      placeholder={`Enter ${input.nodeName.toLowerCase()}...`}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                        focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 
                        bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                        placeholder-gray-500 dark:placeholder-gray-400"
                    />
                  )}
                </div>
              ))
            )}
          </div>

          <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
            <button
              onClick={handleRunAgent}
              disabled={!hasAllInputs || isLoading}
              className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                hasAllInputs && !isLoading
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
              }`}
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-indigo-600 rounded-full animate-spin"></div>
                  Executing with Clara Flow SDK...
                </div>
              ) : (
                `🚀 Run Agent (${inputValues.filter(iv => iv.value).length}/${inputValues.length} inputs)`
              )}
            </button>

            {inputValues.length > 0 && (
              <button
                onClick={clearInputs}
                disabled={isLoading}
                className="w-full py-2 px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                Clear All Inputs
              </button>
            )}
          </div>
        </div>

        {/* Results Panel */}
        <div className="flex-1 bg-white dark:bg-gray-800 flex flex-col">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Agent Results</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              View the output from your agent execution using Clara Flow SDK
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <Bot className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  <h4 className="text-lg font-medium text-gray-500 dark:text-gray-400 mb-2">
                    Ready to Execute
                  </h4>
                  <p className="text-gray-400 dark:text-gray-500">
                    Configure your inputs and click "Run Agent" to see results here
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      message.type === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {message.type === 'assistant' && (
                      <div className="w-8 h-8 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                    )}
                    
                    <div
                      className={`max-w-[85%] p-4 rounded-lg ${
                        message.type === 'user'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700'
                      }`}
                    >
                      {message.type === 'user' ? (
                        <p className="text-white">{message.content}</p>
                      ) : (
                        formatMessage(message.content)
                      )}
                      
                      <div className={`mt-2 text-xs opacity-70 ${
                        message.type === 'user' ? 'text-indigo-100' : 'text-gray-500 dark:text-gray-400'
                      }`}>
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                    
                    {message.type === 'user' && (
                      <div className="w-8 h-8 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">U</span>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentRunnerSDK; 