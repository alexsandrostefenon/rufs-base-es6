
export class Response {

    constructor() {
        this.status = undefined;
        this.data = undefined;
    }

    static create(obj, status) {
        let contentResult = new Response();
        contentResult.status = status;
        contentResult.data = obj;
        return contentResult;
    }

    static ok(obj) {
        return Response.create(obj, 200);
    }

    static badRequest(msg) {
        return Response.create (msg, 400);
    }

    static unauthorized(msg) {
        return Response.create (msg, 401);
    }

    static notFound(msg) {
        return Response.create (msg, 404);
    }

    static internalServerError (msg) {
        return Response.create (msg, 500);
    }

}
