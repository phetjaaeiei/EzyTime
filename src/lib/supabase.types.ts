import type { EventType, Position } from "../types";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      time_logs: {
        Row: {
          id: string;
          employee_name: string;
          position: Position;
          event_type: EventType;
          scanned_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          employee_name: string;
          position: Position;
          event_type: EventType;
          scanned_at?: string;
          created_at?: string;
        };
        Update: never;
      };
      admin_users: {
        Row: {
          user_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          created_at?: string;
        };
        Update: never;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
