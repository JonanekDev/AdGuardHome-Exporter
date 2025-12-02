export interface AdGuardServer {
    url: string;
    username: string;
    password: string;
}

export interface AdGuardAPIStatus {
    version: string;
    dns_addresses: string[];
    protection_disabled_duration: number;
    protection_enabled: boolean;
    dhcp_available: boolean;
    running: boolean;
}

export type StatEntry = Record<string, number>;

export interface AdGuardAPIStats {
    time_units: string;

    top_queried_domains: StatEntry[];
    top_clients: StatEntry[];
    top_blocked_domains: StatEntry[];
    top_upstreams_responses: StatEntry[];
    top_upstreams_avg_time: StatEntry[];

    dns_queries: number[];
    blocked_filtering: number[];
    replaced_safebrowsing: number[];
    replaced_parental: number[];

    num_dns_queries: number;
    num_blocked_filtering: number;
    num_replaced_safebrowsing: number;
    num_replaced_safesearch: number;
    num_replaced_parental: number;
    avg_processing_time: number;
}