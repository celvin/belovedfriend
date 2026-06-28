--
-- PostgreSQL database dump
--

\restrict e7yiXRcnwFowMcfVIMBznanLCXgAGZjOXyisndinJMEMBm7GldeGsWmvvejXbLG

-- Dumped from database version 17.10 (9f6157c)
-- Dumped by pg_dump version 17.10 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: magic_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.magic_links (
    id integer NOT NULL,
    email text NOT NULL,
    token_hash text NOT NULL,
    redirect_to text,
    request_ip text,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: magic_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.magic_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: magic_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.magic_links_id_seq OWNED BY public.magic_links.id;


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id integer NOT NULL,
    tenant_id integer NOT NULL,
    user_id integer,
    type text NOT NULL,
    body text,
    url text,
    author_name text NOT NULL,
    relationship text,
    location text,
    video_path text,
    photo_path text,
    node_id integer,
    card jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.messages_id_seq OWNED BY public.messages.id;


--
-- Name: reach_edges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reach_edges (
    id integer NOT NULL,
    tenant_id integer NOT NULL,
    source_node_id integer NOT NULL,
    target_node_id integer NOT NULL,
    created_by_user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reach_edges_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reach_edges_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reach_edges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reach_edges_id_seq OWNED BY public.reach_edges.id;


--
-- Name: reach_nodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reach_nodes (
    id integer NOT NULL,
    tenant_id integer NOT NULL,
    label text NOT NULL,
    category text NOT NULL,
    lat double precision,
    lng double precision,
    note text,
    is_anchor boolean DEFAULT false NOT NULL,
    created_by_user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reach_nodes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reach_nodes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reach_nodes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reach_nodes_id_seq OWNED BY public.reach_nodes.id;


--
-- Name: tenant_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_blocks (
    id integer NOT NULL,
    tenant_id integer NOT NULL,
    user_id integer NOT NULL,
    blocked_by_user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tenant_blocks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tenant_blocks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tenant_blocks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tenant_blocks_id_seq OWNED BY public.tenant_blocks.id;


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id integer NOT NULL,
    slug text NOT NULL,
    friend_name text NOT NULL,
    birth_year integer,
    death_year integer,
    tagline text,
    owner_user_id integer NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    page_config jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tenants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tenants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tenants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tenants_id_seq OWNED BY public.tenants.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email text NOT NULL,
    name text,
    role text DEFAULT 'user'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: magic_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magic_links ALTER COLUMN id SET DEFAULT nextval('public.magic_links_id_seq'::regclass);


--
-- Name: messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages ALTER COLUMN id SET DEFAULT nextval('public.messages_id_seq'::regclass);


--
-- Name: reach_edges id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reach_edges ALTER COLUMN id SET DEFAULT nextval('public.reach_edges_id_seq'::regclass);


--
-- Name: reach_nodes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reach_nodes ALTER COLUMN id SET DEFAULT nextval('public.reach_nodes_id_seq'::regclass);


--
-- Name: tenant_blocks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_blocks ALTER COLUMN id SET DEFAULT nextval('public.tenant_blocks_id_seq'::regclass);


--
-- Name: tenants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants ALTER COLUMN id SET DEFAULT nextval('public.tenants_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: magic_links magic_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magic_links
    ADD CONSTRAINT magic_links_pkey PRIMARY KEY (id);


--
-- Name: magic_links magic_links_token_hash_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magic_links
    ADD CONSTRAINT magic_links_token_hash_unique UNIQUE (token_hash);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: reach_edges reach_edges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reach_edges
    ADD CONSTRAINT reach_edges_pkey PRIMARY KEY (id);


--
-- Name: reach_edges reach_edges_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reach_edges
    ADD CONSTRAINT reach_edges_unique UNIQUE (tenant_id, source_node_id, target_node_id);


--
-- Name: reach_nodes reach_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reach_nodes
    ADD CONSTRAINT reach_nodes_pkey PRIMARY KEY (id);


--
-- Name: tenant_blocks tenant_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_blocks
    ADD CONSTRAINT tenant_blocks_pkey PRIMARY KEY (id);


--
-- Name: tenant_blocks tenant_blocks_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_blocks
    ADD CONSTRAINT tenant_blocks_unique UNIQUE (tenant_id, user_id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_slug_unique UNIQUE (slug);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: messages_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_tenant_id_idx ON public.messages USING btree (tenant_id);


--
-- Name: reach_edges_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reach_edges_tenant_id_idx ON public.reach_edges USING btree (tenant_id);


--
-- Name: reach_nodes_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reach_nodes_tenant_id_idx ON public.reach_nodes USING btree (tenant_id);


--
-- Name: tenants_owner_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenants_owner_user_id_idx ON public.tenants USING btree (owner_user_id);


--
-- Name: messages messages_node_id_reach_nodes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_node_id_reach_nodes_id_fk FOREIGN KEY (node_id) REFERENCES public.reach_nodes(id) ON DELETE SET NULL;


--
-- Name: messages messages_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: reach_edges reach_edges_created_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reach_edges
    ADD CONSTRAINT reach_edges_created_by_user_id_users_id_fk FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: reach_edges reach_edges_source_node_id_reach_nodes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reach_edges
    ADD CONSTRAINT reach_edges_source_node_id_reach_nodes_id_fk FOREIGN KEY (source_node_id) REFERENCES public.reach_nodes(id) ON DELETE CASCADE;


--
-- Name: reach_edges reach_edges_target_node_id_reach_nodes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reach_edges
    ADD CONSTRAINT reach_edges_target_node_id_reach_nodes_id_fk FOREIGN KEY (target_node_id) REFERENCES public.reach_nodes(id) ON DELETE CASCADE;


--
-- Name: reach_edges reach_edges_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reach_edges
    ADD CONSTRAINT reach_edges_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: reach_nodes reach_nodes_created_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reach_nodes
    ADD CONSTRAINT reach_nodes_created_by_user_id_users_id_fk FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: reach_nodes reach_nodes_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reach_nodes
    ADD CONSTRAINT reach_nodes_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: tenant_blocks tenant_blocks_blocked_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_blocks
    ADD CONSTRAINT tenant_blocks_blocked_by_user_id_users_id_fk FOREIGN KEY (blocked_by_user_id) REFERENCES public.users(id);


--
-- Name: tenant_blocks tenant_blocks_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_blocks
    ADD CONSTRAINT tenant_blocks_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: tenant_blocks tenant_blocks_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_blocks
    ADD CONSTRAINT tenant_blocks_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: tenants tenants_owner_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_owner_user_id_users_id_fk FOREIGN KEY (owner_user_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict e7yiXRcnwFowMcfVIMBznanLCXgAGZjOXyisndinJMEMBm7GldeGsWmvvejXbLG

