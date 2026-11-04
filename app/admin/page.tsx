import { redirect } from 'next/navigation';

// /admin has no page of its own; the admin layout has already checked the person is an admin.
export default function AdminHome() {
  redirect('/admin/orders');
}
