'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { exportedDb as firebaseDb } from '@/lib/firebase';
import { collection, query, getDocs, where, Timestamp } from 'firebase/firestore';
import { format, differenceInMinutes } from 'date-fns';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import Script from 'next/script';
import html2pdf from 'html2pdf.js';

interface AttendanceRecord {
  id: string;
  userId: string;
  date: Timestamp;
  inTime: Timestamp;
  outTime: Timestamp | null;
  userName?: string;
  status: 'PRESENT' | 'LATE' | 'ABSENT';
  overtime: number;
}

interface UserData {
  id: string;
  name: string;
  email: string;
}

const calculateDuration = (inTime: Timestamp, outTime: Timestamp | null): string => {
  if (!outTime) return 'In Progress';
  
  const minutes = differenceInMinutes(outTime.toDate(), inTime.toDate());
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  return `${hours}h ${remainingMinutes}m`;
};

export default function ReportsPage() {
  const { isManager } = useAuth();
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [pdfMakeLoaded, setPdfMakeLoaded] = useState(false);
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [userNames, setUserNames] = useState<{ [key: string]: string }>({});
  const [users, setUsers] = useState<UserData[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [summaryStats, setSummaryStats] = useState({
    total: 0,
    present: 0,
    late: 0,
    absent: 0
  });

  // Load pdfMake scripts
  useEffect(() => {
    const loadPdfMake = async () => {
      try {
        await Promise.all([
          new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/pdfmake.min.js';
            script.onload = resolve;
            document.head.appendChild(script);
          }),
          new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/vfs_fonts.js';
            script.onload = resolve;
            document.head.appendChild(script);
          })
        ]);
        setPdfMakeLoaded(true);
      } catch (error) {
        console.error('Error loading PDF scripts:', error);
      }
    };

    loadPdfMake();
  }, []);

  // Add calculateSummaryStats function
  const calculateSummaryStats = (records: AttendanceRecord[]) => {
    const stats = {
      total: records.length,
      present: records.filter(r => r.status === 'PRESENT').length,
      late: records.filter(r => r.status === 'LATE').length,
      absent: records.filter(r => r.status === 'ABSENT').length
    };
    setSummaryStats(stats);
  };

  useEffect(() => {
    if (!isManager) return;

    const fetchUsers = async () => {
      const usersSnapshot = await getDocs(collection(firebaseDb, 'users'));
      const usersData = usersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as UserData[];
      setUsers(usersData);

      const namesMap: { [key: string]: string } = {};
      usersData.forEach(user => {
        namesMap[user.id] = user.name || user.email;
      });
      setUserNames(namesMap);
    };

    fetchUsers();
  }, [isManager]);

  useEffect(() => {
    if (!isManager) return;

    const fetchAttendanceRecords = async () => {
      try {
        setLoading(true);
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const startTimestamp = Timestamp.fromDate(start);
        const endTimestamp = Timestamp.fromDate(end);
        const attendanceRef = collection(firebaseDb, 'attendance');

        let queryConstraints = [
          where('date', '>=', startTimestamp),
          where('date', '<=', endTimestamp)
        ];

        if (selectedUser !== 'all') {
          queryConstraints = [
            where('userId', '==', selectedUser),
            ...queryConstraints
          ];
        }

        const baseQuery = query(attendanceRef, ...queryConstraints);
        const querySnapshot = await getDocs(baseQuery);
        
        const records = querySnapshot.docs
          .map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as AttendanceRecord[];

        // Sort by date in descending order
        records.sort((a, b) => b.date.seconds - a.date.seconds);
        
        setAttendanceRecords(records);
        calculateSummaryStats(records); // Calculate summary stats when records are fetched
      } catch (error) {
        console.error('Error fetching attendance records:', error);
        alert('Error fetching records. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchAttendanceRecords();
  }, [isManager, startDate, endDate, selectedUser]);

  const generatePDF = async () => {
    if (generatingPDF) return;
    
    try {
      setGeneratingPDF(true);

      // Create a temporary div for the PDF content
      const element = document.createElement('div');
      element.innerHTML = `
        <div style="padding: 20px;">
          <!-- Header -->
          <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
            <h1 style="color: #1e40af; font-size: 24px; margin: 0;">Brand Care</h1>
            <h2 style="color: #1e40af; font-size: 20px; margin: 0;">Attendance Management System</h2>
          </div>

          <!-- Title -->
          <h2 style="color: #1e40af; text-align: center; margin: 20px 0;">Attendance Report</h2>

          <!-- Info Section -->
          <div style="margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Date Range:</strong> ${format(startDate, 'MMM d, yyyy')} - ${format(endDate, 'MMM d, yyyy')}</p>
            <p style="margin: 5px 0;"><strong>Employee:</strong> ${selectedUser === 'all' ? 'All Employees' : userNames[selectedUser]}</p>
          </div>

          <!-- Summary Stats -->
          <div style="display: flex; gap: 30px; margin: 20px 0;">
            <p style="margin: 0; color: #1e40af;"><strong>Total Records:</strong> ${summaryStats.total}</p>
            <p style="margin: 0; color: #15803d;"><strong>Present:</strong> ${summaryStats.present}</p>
            <p style="margin: 0; color: #854d0e;"><strong>Late:</strong> ${summaryStats.late}</p>
            <p style="margin: 0; color: #dc2626;"><strong>Absent:</strong> ${summaryStats.absent}</p>
          </div>

          <!-- Table -->
          <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <thead>
              <tr style="background-color: #e2e8f0;">
                <th style="padding: 12px; text-align: left; color: #1e3a8a; border: 1px solid #cbd5e1;">Date</th>
                <th style="padding: 12px; text-align: left; color: #1e3a8a; border: 1px solid #cbd5e1;">Employee</th>
                <th style="padding: 12px; text-align: left; color: #1e3a8a; border: 1px solid #cbd5e1;">Check In</th>
                <th style="padding: 12px; text-align: left; color: #1e3a8a; border: 1px solid #cbd5e1;">Check Out</th>
                <th style="padding: 12px; text-align: left; color: #1e3a8a; border: 1px solid #cbd5e1;">Status</th>
                <th style="padding: 12px; text-align: left; color: #1e3a8a; border: 1px solid #cbd5e1;">Duration</th>
                <th style="padding: 12px; text-align: left; color: #1e3a8a; border: 1px solid #cbd5e1;">Overtime</th>
              </tr>
            </thead>
            <tbody>
              ${attendanceRecords.map((record, index) => `
                <tr style="background-color: ${index % 2 === 0 ? '#f8fafc' : '#ffffff'};">
                  <td style="padding: 12px; border: 1px solid #e2e8f0;">${format(record.date.toDate(), 'MMM d, yyyy')}</td>
                  <td style="padding: 12px; border: 1px solid #e2e8f0;">${userNames[record.userId] || 'Unknown'}</td>
                  <td style="padding: 12px; border: 1px solid #e2e8f0;">${record.inTime ? format(record.inTime.toDate(), 'hh:mm a') : '-'}</td>
                  <td style="padding: 12px; border: 1px solid #e2e8f0;">${record.outTime ? format(record.outTime.toDate(), 'hh:mm a') : '-'}</td>
                  <td style="padding: 12px; border: 1px solid #e2e8f0; color: ${
                    record.status === 'PRESENT' ? '#15803d' : 
                    record.status === 'LATE' ? '#854d0e' : '#dc2626'
                  };">${record.status || 'Unknown'}</td>
                  <td style="padding: 12px; border: 1px solid #e2e8f0;">${record.inTime && record.outTime ? calculateDuration(record.inTime, record.outTime) : '-'}</td>
                  <td style="padding: 12px; border: 1px solid #e2e8f0; color: ${record.overtime > 0 ? '#15803d' : '#666666'};">
                    ${record.overtime > 0 ? `${record.overtime.toFixed(2)}h` : '-'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <!-- Footer -->
          <div style="margin-top: 20px; display: flex; justify-content: space-between; color: #64748b; font-size: 12px;">
            <span>${format(new Date(), 'MMM d, yyyy, h:mm a')}</span>
            <span>Generated by Brand Care AMS</span>
          </div>
        </div>
      `;

      // PDF options
      const options = {
        margin: 10,
        filename: `attendance-report-${selectedUser === 'all' ? 'all-employees' : userNames[selectedUser]?.replace(/\s+/g, '-').toLowerCase() || 'unknown'}-${format(new Date(), 'yyyy-MM-dd-HHmm')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2,
          logging: false,
          useCORS: true
        },
        jsPDF: { 
          unit: 'mm', 
          format: 'a4', 
          orientation: 'landscape'
        }
      };

      // Generate PDF
      const pdf = await html2pdf().from(element).set(options).save();

    } catch (error) {
      console.error('PDF Generation Error:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setGeneratingPDF(false);
    }
  };

  if (!isManager) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">You do not have permission to view this page.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50 py-6 sm:py-8 lg:py-12">
      <div className="mx-auto max-w-screen-xl px-4 md:px-8">
        <div className="mb-10 md:mb-16">
          <h2 className="mb-4 text-2xl font-bold text-gray-800 md:mb-6 lg:text-3xl">
            Attendance Reports
          </h2>
        </div>

        {/* Add Summary Statistics Card */}
        <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-lg font-semibold text-gray-800">Total Records</h3>
            <p className="text-3xl font-bold text-blue-600">{summaryStats.total}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-lg font-semibold text-gray-800">Present</h3>
            <p className="text-3xl font-bold text-green-600">{summaryStats.present}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-lg font-semibold text-gray-800">Late</h3>
            <p className="text-3xl font-bold text-yellow-600">{summaryStats.late}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-lg font-semibold text-gray-800">Absent</h3>
            <p className="text-3xl font-bold text-red-600">{summaryStats.absent}</p>
          </div>
        </div>

        <div className="mb-6 bg-white rounded-lg shadow p-4 md:p-8">
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="space-y-1">
              <label htmlFor="employee" className="block text-sm font-medium text-gray-700">
                Employee
              </label>
              <select
                id="employee"
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              >
                <option value="all">All Employees</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.name || user.email}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="start-date" className="block text-sm font-medium text-gray-700">
                Start Date
              </label>
              <DatePicker
                id="start-date"
                selected={startDate}
                onChange={(date: Date | null) => date && setStartDate(date)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="end-date" className="block text-sm font-medium text-gray-700">
                End Date
              </label>
              <DatePicker
                id="end-date"
                selected={endDate}
                onChange={(date: Date | null) => date && setEndDate(date)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={generatePDF}
                disabled={generatingPDF}
                className={`w-full ${
                  generatingPDF
                    ? 'bg-blue-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                } text-white px-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors duration-200`}
              >
                {generatingPDF ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Generating PDF...
                  </span>
                ) : (
                  'Download Report'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Table Section */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Employee
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Check-in
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Check-out
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Duration
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Overtime
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {attendanceRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                    No attendance records found for the selected criteria
                  </td>
                </tr>
              ) : (
                attendanceRecords.map((record, index) => (
                  <tr 
                    key={record.id} 
                    className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {format(record.date.toDate(), 'MMMM d, yyyy')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {userNames[record.userId] || record.userId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {record.inTime ? (
                        format(record.inTime.toDate(), 'hh:mm a')
                      ) : (
                        <span className="text-red-600">Not Marked</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {record.outTime ? (
                        format(record.outTime.toDate(), 'hh:mm a')
                      ) : (
                        <span className="text-yellow-600">Not marked</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        record.status === 'PRESENT' 
                          ? 'bg-green-100 text-green-800'
                          : record.status === 'LATE'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {record.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {record.inTime && record.outTime ? (
                        calculateDuration(record.inTime, record.outTime)
                      ) : record.status === 'ABSENT' ? (
                        <span className="text-red-600">Absent</span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {record.overtime > 0 ? (
                        <span className="text-green-600 font-medium">
                          {record.overtime.toFixed(2)}h
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
} 