#!/usr/bin/env python3
"""
FTP FUSE Filesystem Mount for monk-ftp

Provides filesystem interface to monk-ftp server using Python ftplib and FUSE.
Enables standard Unix tools to work with monk-api data through filesystem operations.

Requirements:
    pip install fusepy

Usage:
    python3 src/utils/ftp-fuse-mount.py /mnt/monk-api
    ls /mnt/monk-api/data/users/
    cat /mnt/monk-api/data/users/user-123.../email
    echo "new content" > /mnt/monk-api/data/users/user-123.../name
    fusermount -u /mnt/monk-api
"""

import os
import sys
import stat
import errno
import ftplib
from datetime import datetime
from typing import Dict, List, Optional

try:
    from fuse import FUSE, FuseOSError, Operations
except ImportError:
    print("Error: fusepy not installed. Install with: pip install fusepy")
    sys.exit(1)


class FtpFuseOperations(Operations):
    """FUSE filesystem operations using FTP protocol"""
    
    def __init__(self, ftp_host='localhost', ftp_port=2121, ftp_user='root', ftp_pass='fake.jwt.token'):
        self.ftp_host = ftp_host
        self.ftp_port = ftp_port
        self.ftp_user = ftp_user
        self.ftp_pass = ftp_pass
        self._ftp_cache: Dict[str, any] = {}
        self._dir_cache: Dict[str, List[str]] = {}
        
    def _get_ftp_connection(self) -> ftplib.FTP:
        """Create authenticated FTP connection"""
        try:
            ftp = ftplib.FTP()
            ftp.connect(self.ftp_host, self.ftp_port)
            ftp.login(self.ftp_user, self.ftp_pass)
            return ftp
        except Exception as e:
            print(f"FTP connection failed: {e}")
            raise FuseOSError(errno.ECONNREFUSED)
    
    def _ftp_list_to_files(self, ftp_listing: List[str]) -> Dict[str, Dict]:
        """Parse FTP LIST output to file information"""
        files = {}
        
        for line in ftp_listing:
            if not line.strip():
                continue
                
            # Parse FTP LIST format: drwx 1 owner group size date time name
            parts = line.split(None, 8)
            if len(parts) < 9:
                continue
                
            permissions = parts[0]
            size = int(parts[4]) if parts[4].isdigit() else 0
            name = parts[8]
            
            # Determine file type
            is_dir = permissions.startswith('d')
            
            files[name] = {
                'is_dir': is_dir,
                'size': size,
                'permissions': permissions,
                'mode': stat.S_IFDIR if is_dir else stat.S_IFREG,
                'nlink': 2 if is_dir else 1,
                'mtime': int(datetime.now().timestamp()),  # Could parse from FTP response
                'ctime': int(datetime.now().timestamp()),
                'atime': int(datetime.now().timestamp())
            }
            
        return files
    
    def readdir(self, path: str, fh=None) -> List[str]:
        """List directory contents"""
        try:
            if path in self._dir_cache:
                return self._dir_cache[path]
                
            ftp = self._get_ftp_connection()
            
            # Change to directory
            if path != '/':
                ftp.cwd(path)
            
            # Get directory listing
            listing = []
            ftp.retrlines('LIST', listing.append)
            ftp.quit()
            
            # Parse listing
            files = self._ftp_list_to_files(listing)
            file_names = ['.', '..'] + list(files.keys())
            
            # Cache results
            self._dir_cache[path] = file_names
            
            return file_names
            
        except ftplib.error_perm as e:
            if '550' in str(e):  # File not found
                raise FuseOSError(errno.ENOENT)
            elif '530' in str(e):  # Not logged in / permission denied
                raise FuseOSError(errno.EACCES)
            else:
                raise FuseOSError(errno.EIO)
        except Exception as e:
            print(f"readdir error: {e}")
            raise FuseOSError(errno.EIO)
    
    def getattr(self, path: str, fh=None) -> Dict:
        """Get file/directory attributes"""
        try:
            if path == '/':
                # Root directory
                return {
                    'st_mode': stat.S_IFDIR | 0o755,
                    'st_nlink': 2,
                    'st_size': 0,
                    'st_ctime': int(datetime.now().timestamp()),
                    'st_mtime': int(datetime.now().timestamp()),
                    'st_atime': int(datetime.now().timestamp())
                }
            
            # Use FTP STAT command for file information
            ftp = self._get_ftp_connection()
            
            # Try to get file info via SIZE and MDTM commands
            try:
                size_resp = ftp.sendcmd(f'SIZE {path}')
                file_size = int(size_resp.split()[1]) if size_resp.startswith('213') else 0
            except:
                file_size = 0
            
            try:
                mdtm_resp = ftp.sendcmd(f'MDTM {path}')
                # Parse MDTM timestamp: 213 20250825151723
                if mdtm_resp.startswith('213'):
                    timestamp_str = mdtm_resp.split()[1]
                    # Convert YYYYMMDDHHMMSS to timestamp
                    dt = datetime.strptime(timestamp_str, '%Y%m%d%H%M%S')
                    mtime = int(dt.timestamp())
                else:
                    mtime = int(datetime.now().timestamp())
            except:
                mtime = int(datetime.now().timestamp())
            
            ftp.quit()
            
            # Assume it's a file if we got here
            return {
                'st_mode': stat.S_IFREG | 0o644,
                'st_nlink': 1,
                'st_size': file_size,
                'st_ctime': mtime,
                'st_mtime': mtime,
                'st_atime': mtime
            }
            
        except ftplib.error_perm as e:
            if '550' in str(e):
                raise FuseOSError(errno.ENOENT)
            elif '530' in str(e):
                raise FuseOSError(errno.EACCES)
            else:
                raise FuseOSError(errno.EIO)
        except Exception as e:
            print(f"getattr error for {path}: {e}")
            raise FuseOSError(errno.ENOENT)
    
    def read(self, path: str, size: int, offset: int, fh=None) -> bytes:
        """Read file content"""
        try:
            ftp = self._get_ftp_connection()
            
            # Use RETR command to download file
            content = bytearray()
            
            def store_data(data):
                content.extend(data.encode('utf-8'))
            
            ftp.retrbinary(f'RETR {path}', store_data)
            ftp.quit()
            
            # Apply offset and size
            return bytes(content[offset:offset + size])
            
        except ftplib.error_perm as e:
            if '550' in str(e):
                raise FuseOSError(errno.ENOENT)
            else:
                raise FuseOSError(errno.EIO)
        except Exception as e:
            print(f"read error for {path}: {e}")
            raise FuseOSError(errno.EIO)
    
    def write(self, path: str, data: bytes, offset: int, fh=None) -> int:
        """Write file content"""
        try:
            # For simplicity, this implementation overwrites the entire file
            # A complete implementation would handle partial writes
            
            ftp = self._get_ftp_connection()
            
            # Use STOR command to upload file
            from io import BytesIO
            data_stream = BytesIO(data)
            
            ftp.storbinary(f'STOR {path}', data_stream)
            ftp.quit()
            
            return len(data)
            
        except ftplib.error_perm as e:
            if '550' in str(e):
                raise FuseOSError(errno.EACCES)
            else:
                raise FuseOSError(errno.EIO)
        except Exception as e:
            print(f"write error for {path}: {e}")
            raise FuseOSError(errno.EIO)
    
    def truncate(self, path: str, length: int, fh=None):
        """Truncate file (simplified implementation)"""
        # For monk-api integration, truncation would need special handling
        pass
    
    def unlink(self, path: str):
        """Delete file"""
        try:
            ftp = self._get_ftp_connection()
            ftp.delete(path)
            ftp.quit()
        except ftplib.error_perm as e:
            if '550' in str(e):
                raise FuseOSError(errno.ENOENT)
            else:
                raise FuseOSError(errno.EACCES)
        except Exception as e:
            print(f"unlink error for {path}: {e}")
            raise FuseOSError(errno.EIO)


def main():
    """Mount FTP server as FUSE filesystem"""
    if len(sys.argv) != 2:
        print("Usage: python3 ftp-fuse-mount.py <mountpoint>")
        print("Example: python3 ftp-fuse-mount.py /mnt/monk-api")
        sys.exit(1)
    
    mountpoint = sys.argv[1]
    
    # Ensure mountpoint exists
    os.makedirs(mountpoint, exist_ok=True)
    
    print(f"Mounting monk-ftp server at {mountpoint}")
    print("Available operations:")
    print("  ls /mnt/monk-api/data/users/")
    print("  cat /mnt/monk-api/data/users/user-123.../email")
    print("  echo 'new content' > /mnt/monk-api/data/users/user-123.../name")
    print("  fusermount -u /mnt/monk-api  # to unmount")
    print()
    
    # Create FUSE filesystem
    fuse = FUSE(
        FtpFuseOperations(),
        mountpoint,
        nothreads=True,
        foreground=True,
        allow_other=False
    )


if __name__ == '__main__':
    main()