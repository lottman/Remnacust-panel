export class GetHttpStatsResponseModel {
    routes: { method: string; route: string; count: number }[];
    total: number;

    constructor(data: {
        routes: { method: string; route: string; count: number }[];
        total: number;
    }) {
        this.routes = data.routes;
        this.total = data.total;
    }
}
