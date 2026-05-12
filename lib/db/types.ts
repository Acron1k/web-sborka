export type ListType = 'common' | 'personal' | 'food';
export type Category = 'meat' | 'veg' | 'drinks' | 'snacks' | 'other';

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
};

export type Database = {
  public: {
    Tables: {
      trips: {
        Row: Trip;
        Insert: Omit<Trip, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Trip>;
      };
      families: {
        Row: Family;
        Insert: Omit<Family, 'id'> & { id?: string };
        Update: Partial<Family>;
      };
      items: {
        Row: Item;
        Insert: Omit<Item, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Item>;
      };
      item_claims: {
        Row: ItemClaim;
        Insert: Omit<ItemClaim, 'id' | 'claimed_at'> & { id?: string; claimed_at?: string };
        Update: Partial<ItemClaim>;
      };
    };
  };
};
