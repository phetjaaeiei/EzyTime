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
      employee_stock_positions: {
        Row: { user_id: string; position: Position };
        Insert: { user_id: string; position: Position };
        Update: { position?: Position };
      };
      position_stock_items: {
        Row: { position: Position; item_id: string };
        Insert: { position: Position; item_id: string };
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
    Functions: {
      list_stock_employees: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{ user_id: string; display_name: string; email: string | null; position: Position | null }>;
      };
      set_position_stock_items: {
        Args: { target_position: Position; target_item_ids: string[] };
        Returns: undefined;
      };
      can_manage_stock_item: {
        Args: { target_item_id: string };
        Returns: boolean;
      };
      get_stock_item_balances: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{ item_id: string; on_hand: number }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
