-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.charging_port (
  port_id uuid NOT NULL DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL,
  port_number integer NOT NULL,
  port_type text NOT NULL,
  is_occupied boolean DEFAULT false,
  current_status USER-DEFINED NOT NULL DEFAULT 'available'::port_status,
  voltage numeric,
  amperage numeric,
  last_status_update timestamp with time zone DEFAULT now(),
  is_publicly_visible boolean DEFAULT true,
  esp32_device_id text UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  device_mqtt_id character varying,
  port_number_in_device integer,
  is_premium boolean DEFAULT false,
  CONSTRAINT charging_port_pkey PRIMARY KEY (port_id),
  CONSTRAINT charging_port_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.charging_station(station_id)
);
CREATE TABLE public.charging_session (
  session_id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  port_id uuid NOT NULL,
  station_id uuid NOT NULL,
  start_time timestamp with time zone NOT NULL DEFAULT now(),
  end_time timestamp with time zone,
  energy_consumed_kwh numeric DEFAULT 0.0,
  is_premium boolean NOT NULL,
  session_status USER-DEFINED NOT NULL DEFAULT 'active'::session_status,
  initial_battery_level numeric,
  final_battery_level numeric,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  energy_consumed_mah real DEFAULT 0.0,
  last_status_update timestamp with time zone,
  total_mah_consumed numeric DEFAULT 0.0,
  cost numeric DEFAULT 0.0,
  initial_total_mah numeric DEFAULT 0,
  CONSTRAINT charging_session_pkey PRIMARY KEY (session_id),
  CONSTRAINT charging_session_port_id_fkey FOREIGN KEY (port_id) REFERENCES public.charging_port(port_id),
  CONSTRAINT charging_session_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.charging_station(station_id),
  CONSTRAINT charging_session_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);
CREATE TABLE public.charging_station (
  station_id uuid NOT NULL DEFAULT gen_random_uuid(),
  station_name text NOT NULL,
  location_description text NOT NULL,
  latitude numeric,
  longitude numeric,
  solar_panel_wattage integer,
  battery_capacity_mah numeric,
  num_free_ports integer DEFAULT 0,
  num_premium_ports integer DEFAULT 0,
  last_maintenance_id uuid,
  is_active boolean DEFAULT true,
  current_battery_level numeric,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  last_maintenance_date timestamp with time zone,
  price_per_mah numeric DEFAULT 0.25,
  device_mqtt_id text,
  CONSTRAINT charging_station_pkey PRIMARY KEY (station_id)
);
CREATE TABLE public.subscription_plans (
  plan_id uuid NOT NULL DEFAULT gen_random_uuid(),
  plan_name text NOT NULL UNIQUE,
  description text,
  price numeric NOT NULL,
  daily_mah_limit numeric NOT NULL,
  max_session_duration_hours numeric,
  fast_charging_access boolean DEFAULT false,
  priority_access boolean DEFAULT false,
  cooldown_percentage numeric,
  cooldown_time_hour numeric,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  duration_type text NOT NULL DEFAULT 'monthly'::text CHECK (duration_type = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text, 'quarterly'::text, 'yearly'::text])),
  duration_value integer NOT NULL CHECK (duration_value > 0),
  paypal_link text,
  is_active boolean DEFAULT true,
  CONSTRAINT subscription_plans_pkey PRIMARY KEY (plan_id)
);
CREATE TABLE public.user_subscription (
  user_subscription_id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  start_date timestamp with time zone NOT NULL DEFAULT now(),
  end_date timestamp with time zone NOT NULL,
  is_active boolean DEFAULT true,
  current_daily_mah_consumed numeric DEFAULT 0.0,
  last_quota_reset timestamp with time zone DEFAULT now(),
  payment_references text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  borrowed_mah_today numeric DEFAULT 0.0,
  borrowed_mah_pending numeric DEFAULT 0.0,
  last_borrow_date date,
  CONSTRAINT user_subscription_pkey PRIMARY KEY (user_subscription_id),
  CONSTRAINT user_subscription_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(plan_id),
  CONSTRAINT user_subscription_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);
CREATE TABLE public.users (
  user_id uuid NOT NULL,
  fname text,
  lname text,
  contact_number text,
  is_admin boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  email text,
  last_login timestamp with time zone,
  CONSTRAINT users_pkey PRIMARY KEY (user_id),
  CONSTRAINT users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.consumption_data (
  id integer NOT NULL DEFAULT nextval('consumption_data_id_seq'::regclass),
  session_id uuid,
  device_id character varying NOT NULL,
  consumption_watts real,
  timestamp timestamp with time zone NOT NULL DEFAULT now(),
  charger_state character varying,
  port_number integer,
  CONSTRAINT consumption_data_pkey PRIMARY KEY (id),
  CONSTRAINT fk_session FOREIGN KEY (session_id) REFERENCES public.charging_session(session_id)
);
CREATE TABLE public.current_device_status (
  device_id character varying NOT NULL,
  status_message character varying,
  charger_state character varying,
  last_update timestamp with time zone NOT NULL DEFAULT now(),
  port_id uuid NOT NULL,
  CONSTRAINT current_device_status_pkey PRIMARY KEY (device_id, port_id),
  CONSTRAINT fk_current_device_status_port FOREIGN KEY (port_id) REFERENCES public.charging_port(port_id)
);
CREATE TABLE public.device_status_logs (
  id integer NOT NULL DEFAULT nextval('device_status_logs_id_seq'::regclass),
  device_id character varying NOT NULL,
  status_message character varying,
  charger_state character varying,
  timestamp timestamp with time zone NOT NULL DEFAULT now(),
  port_id uuid,
  CONSTRAINT device_status_logs_pkey PRIMARY KEY (id),
  CONSTRAINT fk_device_status_log_port FOREIGN KEY (port_id) REFERENCES public.charging_port(port_id),
  CONSTRAINT fk_device_status_logs_port FOREIGN KEY (port_id) REFERENCES public.charging_port(port_id)
);
CREATE TABLE public.notification (
  notification_id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  notification_type USER-DEFINED NOT NULL,
  notification_context text,
  notification_content text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT notification_pkey PRIMARY KEY (notification_id),
  CONSTRAINT notification_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);
CREATE TABLE public.station_maintenance (
  maintenance_id uuid NOT NULL DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL,
  performed_by text,
  maintenance_date timestamp with time zone NOT NULL DEFAULT now(),
  description text,
  cost numeric,
  next_scheduled_date date,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT station_maintenance_pkey PRIMARY KEY (maintenance_id),
  CONSTRAINT station_maintenance_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.charging_station(station_id)
);
CREATE TABLE public.system_logs (
  log_id uuid NOT NULL DEFAULT gen_random_uuid(),
  timestamp timestamp with time zone NOT NULL DEFAULT now(),
  log_type text NOT NULL,
  source text,
  message text NOT NULL,
  user_id uuid,
  CONSTRAINT system_logs_pkey PRIMARY KEY (log_id)
);
CREATE TABLE public.user_devices (
  device_id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_type text NOT NULL,
  device_name text,
  device_model text,
  battery_capacity_mah numeric,
  current_battery_level numeric,
  is_charging boolean DEFAULT false,
  last_updated timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_devices_pkey PRIMARY KEY (device_id),
  CONSTRAINT user_devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);
CREATE TABLE public.paypal_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  order_id character varying NOT NULL UNIQUE,
  payment_type character varying NOT NULL,
  plan_id uuid,
  amount numeric NOT NULL,
  currency character varying DEFAULT 'PHP'::character varying,
  status character varying NOT NULL,
  paypal_capture_id character varying,
  expires_at timestamp with time zone,
  idempotency_key character varying UNIQUE,
  error_message text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT paypal_orders_pkey PRIMARY KEY (id),
  CONSTRAINT paypal_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT paypal_orders_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(plan_id)
);
CREATE TABLE public.payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  paypal_order_id character varying NOT NULL,
  payment_capture_id character varying,
  payment_type character varying NOT NULL,
  amount numeric NOT NULL,
  currency character varying DEFAULT 'PHP'::character varying,
  status character varying NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT payments_pkey PRIMARY KEY (id),
  CONSTRAINT payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT payments_paypal_order_id_fkey FOREIGN KEY (paypal_order_id) REFERENCES public.paypal_orders(order_id)
);
CREATE TABLE public.payment_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  action character varying NOT NULL,
  payload jsonb,
  response jsonb,
  status character varying,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT payment_logs_pkey PRIMARY KEY (id),
  CONSTRAINT payment_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.webhooks_processed (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id character varying NOT NULL UNIQUE,
  event_type character varying NOT NULL,
  processed_at timestamp with time zone DEFAULT now(),
  CONSTRAINT webhooks_processed_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_usage (
  user_id uuid NOT NULL,
  total_consumed_mah integer NOT NULL DEFAULT 0,
  last_reset_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_usage_pkey PRIMARY KEY (user_id),
  CONSTRAINT user_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);