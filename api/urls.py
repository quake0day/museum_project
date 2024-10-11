from django.urls import path
from .views import InteractionList, interaction_list

urlpatterns = [
    path('interactions/list/', InteractionList.as_view(), name='interaction-list'),
    path('interactions/view/', interaction_list, name='interaction-list-view'),
]

