export type ListType = 'common' | 'personal' | 'food';
export type Category = 'meat' | 'veg' | 'drinks' | 'snacks' | 'other';
export type Importance = 'critical' | 'recommended' | 'optional';

export type Trip = {
  id: string;
  slug: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  created_at: string;
};

export type Family = {
  id: string;
  trip_id: string;
  name: string;
  color: string;
  position: number;
};

export type Item = {
  id: string;
  trip_id: string;
  list_type: ListType;
  title: string;
  qty: string | null;
  category: Category | null;
  family_id: string | null;
  notes: string | null;
  created_by_family_id: string | null;
  is_done: boolean;
  created_at: string;
};

export type ItemClaim = {
  id: string;
  item_id: string;
  family_id: string;
  claimed_at: string;
  is_packed: boolean;
};

export type AISuggestion = {
  id: string;
  trip_id: string;
  list_type: ListType;
  title: string;
  qty: string | null;
  category: Category | null;
  importance: Importance;
  reason: string | null;
  added_to_list_at: string | null;
  added_by_family_id: string | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      trips: {
        Row: Trip;
        Insert: Omit<Trip, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Trip>;
        Relationships: [];
      };
      families: {
        Row: Family;
        Insert: Omit<Family, 'id'> & { id?: string };
        Update: Partial<Family>;
        Relationships: [];
      };
      items: {
        Row: Item;
        Insert: Omit<Item, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Item>;
        Relationships: [];
      };
      item_claims: {
        Row: ItemClaim;
        Insert: Omit<ItemClaim, 'id' | 'claimed_at' | 'is_packed'> & {
          id?: string;
          claimed_at?: string;
          is_packed?: boolean;
        };
        Update: Partial<ItemClaim>;
        Relationships: [];
      };
      ai_suggestions: {
        Row: AISuggestion;
        Insert: Omit<AISuggestion, 'id' | 'created_at' | 'added_to_list_at' | 'added_by_family_id'> & {
          id?: string;
          created_at?: string;
          added_to_list_at?: string | null;
          added_by_family_id?: string | null;
        };
        Update: Partial<AISuggestion>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
