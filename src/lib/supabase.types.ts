import type { EventType, MovementType, Position } from "../types";

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
        Update: Partial<{
          quantity: number;
          note: string | null;
        }>;
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
      stock_items: {
        Row: {
          id: string;
          name: string;
          unit: string;
          category: string | null;
          low_stock_threshold: number | null;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          unit: string;
          category?: string | null;
          low_stock_threshold?: number | null;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          name: string;
          unit: string;
          category: string | null;
          low_stock_threshold: number | null;
          is_active: boolean;
          updated_at: string;
        }>;
      };
      stock_movements: {
        Row: {
          id: string;
          item_id: string;
          type: MovementType;
          quantity: number;
          note: string | null;
          user_id: string | null;
          actor_name: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          item_id: string;
          type: MovementType;
          quantity: number;
          note?: string | null;
          user_id?: string | null;
          actor_name?: string | null;
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
