/**
 * PASV command handler - Passive mode data connection
 * 
 * Creates a data server on random port for file transfers
 */

import { BaseFtpCommand } from '../lib/base-command.js';
import type { FtpConnection } from '../lib/types.js';
import * as net from 'net';

export class PasvCommand extends BaseFtpCommand {
    readonly name = 'PASV';
    readonly needsAuth = true;
    readonly needsDataConnection = false;

    async execute(connection: FtpConnection, args: string): Promise<void> {
        try {
            // Close existing data connection if any
            if (connection.dataConnection?.server) {
                connection.dataConnection.server.close();
                connection.dataConnection = undefined;
            }

            // Create new data server on random port
            const dataServer = net.createServer();
            
            await new Promise<void>((resolve, reject) => {
                dataServer.listen(0, '127.0.0.1', () => {
                    try {
                        const address = dataServer.address() as net.AddressInfo;
                        const port = address.port;
                        
                        // Store data connection info
                        connection.dataConnection = {
                            server: dataServer,
                            port,
                            mode: 'passive'
                        };
                        
                        // Set up data connection handler
                        dataServer.on('connection', (socket) => {
                            if (connection.dataConnection) {
                                connection.dataConnection.socket = socket;
                            }
                            
                            socket.on('close', () => {
                                if (connection.dataConnection) {
                                    connection.dataConnection.socket = undefined;
                                }
                            });
                        });
                        
                        // Calculate PASV response: (h1,h2,h3,h4,p1,p2)
                        // Port = p1 * 256 + p2
                        const p1 = Math.floor(port / 256);
                        const p2 = port % 256;
                        
                        this.sendResponse(connection, 227, `Entering passive mode (127,0,0,1,${p1},${p2})`);
                        resolve();
                        
                    } catch (error) {
                        reject(error);
                    }
                });
                
                dataServer.on('error', (error) => {
                    reject(error);
                });
            });
            
        } catch (error) {
            console.error(`❌ PASV error:`, error);
            this.sendResponse(connection, 425, 'Cannot open passive connection');
            
            // Clean up on failure
            if (connection.dataConnection?.server) {
                connection.dataConnection.server.close();
                connection.dataConnection = undefined;
            }
        }
    }
}