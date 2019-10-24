import url from 'url';
import {randomSample} from 'cyclon.p2p-common';
import {SignallingSocket} from 'cyclon.p2p-rtc-client/lib/SignallingSocket';
import {HttpRequestService} from 'cyclon.p2p-rtc-client';
import {CyclonNode, CyclonNodePointer} from 'cyclon.p2p';
import {SignallingServerSpec} from 'cyclon.p2p-rtc-client/lib/SignallingServerSpec';
import {allSettled, SettledPromise} from './PromiseTools';

const API_PATH = "./api/peers";

export class SignallingServerBootstrap {

    constructor(private readonly signallingSocket: SignallingSocket,
                private readonly httpRequestService: HttpRequestService) {
    }

    /**
     * Fetch a list of registered peers from the server
     */
    getInitialPeerSet(cyclonNode: CyclonNode, limit: number): Promise<any> {

        const serverSpecs = this.signallingSocket.getCurrentServerSpecs();
        if (serverSpecs.length > 0) {

            const specPromises: Promise<CyclonNodePointer[]>[] = serverSpecs.map((serverSpec) => {
                return this.getInitialPeerSetFromServer(cyclonNode, serverSpec, limit);
            });

            return allSettled(specPromises).then((results) => {
                const allResults = SignallingServerBootstrap.collateSuccessfulResults(results);
                return randomSample(SignallingServerBootstrap.deDuplicatePeerList(allResults), limit);
            });
        }

        return Promise.reject(new Error("Not connected to any signalling servers, can't bootstrap"));
    }

    private static collateSuccessfulResults(arrayOfPromises: SettledPromise<CyclonNodePointer[]>[]): CyclonNodePointer[] {
        return arrayOfPromises.reduce((current: CyclonNodePointer[], next: SettledPromise<CyclonNodePointer[]>) => {
            // @ts-ignore
            if (next.status === 'fulfilled') {
                return current.concat(next.value as CyclonNodePointer[]);
            }
            else {
                return current;
            }
        }, []);
    }

    private static deDuplicatePeerList(arrayOfPeers: CyclonNodePointer[]): CyclonNodePointer[] {
        const peerMap: { [id:string]: CyclonNodePointer } = {};

        arrayOfPeers.forEach(function (peer) {
            if (peerMap.hasOwnProperty(peer.id)) {
                if (peerMap[peer.id].seq < peer.seq) {
                    peerMap[peer.id] = peer;
                }
            }
            else {
                peerMap[peer.id] = peer;
            }
        });

        const uniquePeers = [];
        for (const nodeId in peerMap) {
            uniquePeers.push(peerMap[nodeId]);
        }
        return uniquePeers;
    }

    private async getInitialPeerSetFromServer(cyclonNode: CyclonNode, serverSpec: SignallingServerSpec, limit: number): Promise<CyclonNodePointer[]> {
        const response = await this.httpRequestService.get(SignallingServerBootstrap.generateUrl(serverSpec.signallingApiBase, limit));
        return Object.keys(response).filter((peerId) => {
            return peerId !== cyclonNode.getId();
        }).map((peerId) => {
            return response[peerId];
        });
    }

    // TODO room(s) should be configurable
    private static generateUrl(apiBase: string, limit: number): string {
        //noinspection JSCheckFunctionSignatures
        return url.resolve(apiBase, API_PATH) + "?room=CyclonWebRTC&limit=" + limit + "&nocache=" + new Date().getTime();
    }
}
