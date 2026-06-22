export interface FlowState {
  type: 'flow_question' | 'flow_complete' | 'flow_validation_error' | 'flow_cancelled';
  flowName?: string;
  step?: {
    field_type: string;
    options?: Array<{ label: string; value: string }>;
  };
  progress?: number;
  currentStep?: number;
  totalSteps?: number;
  radicado?: string;
  submissionData?: Record<string, any>;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  processingTime?: number;
  createdAt: Date;
  isStreaming?: boolean;
  flowState?: FlowState;
}

export interface Source {
  title: string;
  category: string;
  relevance: number;
}

export interface ChatState {
  isOpen: boolean;
  isMinimized: boolean;
  messages: Message[];
  isTyping: boolean;
  sessionId: string | null;
  isDarkMode: boolean;
  unreadCount: number;
  hasEverOpened: boolean;
}

export interface Document {
  id: string;
  title: string;
  filename: string;
  category: string;
  description: string | null;
  chunk_count: number;
  is_indexed: boolean;
  file_size: number;
  created_at: string;
}

export interface Conversation {
  id: string;
  session_id: string;
  message_count: number;
  feedback: number | null;
  human_mode: boolean;
  human_mode_at: string | null;
  started_at: string;
  last_message_at: string;
}

export interface DashboardStats {
  total_conversations: number;
  conversations_today: number;
  total_user_messages: number;
  messages_today: number;
  active_documents: number;
  indexed_documents: number;
  avg_satisfaction: number | null;
  total_tokens_used: number;
  totalChunks: number;
}

export interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
  tags: string[];
  view_count: number;
  created_at: string;
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
}
